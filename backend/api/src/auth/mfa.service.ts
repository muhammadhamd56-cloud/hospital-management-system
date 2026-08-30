import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';

const MFA_CHALLENGE_EXPIRY = '5m';
const BACKUP_CODE_COUNT = 8;

interface MfaChallengePayload {
  sub: string;
  purpose: 'mfa-challenge';
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Starts (or restarts) MFA setup: generates a new secret and saves it
   * immediately, so re-scanning the QR code after a failed first attempt
   * doesn't require starting over. Not enabled until confirmSetup succeeds
   * with a valid code from it.
   */
  async startSetup(userId: string, email: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });

    const otpauthUrl = generateURI({ issuer: 'MediCore', label: email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeDataUrl };
  }

  /** Confirms setup with a code from the authenticator app, enables MFA,
   *  and returns one-time backup codes (shown to the user exactly once --
   *  only their hashes are ever stored). */
  async confirmSetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.mfaSecret) {
      throw new BadRequestException('Start MFA setup first');
    }

    // See verifyChallenge for why this doesn't just await verify() directly
    // -- it throws (rather than returning { valid: false }) for input that
    // isn't shaped like a TOTP token at all.
    const isValid = await verify({ secret: user.mfaSecret, token: code })
      .then((result) => result.valid)
      .catch(() => false);

    if (!isValid) {
      throw new UnauthorizedException('Incorrect code');
    }

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'));
    const hashes = await Promise.all(backupCodes.map((c) => hashPassword(c)));

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaBackupCodeHashes: hashes },
    });

    return { backupCodes };
  }

  /** Disables MFA. Requires the caller's current password as re-auth, so a
   *  hijacked but still-logged-in session can't silently strip MFA. */
  async disable(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.password || !(await verifyPassword(password, user.password))) {
      throw new UnauthorizedException('Incorrect password');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [] },
    });
  }

  /**
   * Issues a short-lived challenge token after step 1 (password) of login
   * succeeds for an MFA-enabled account. Deliberately shaped nothing like
   * JwtPayload (no email/role/tokenVersion) so JwtStrategy.validate() can
   * never mistake it for a real access token even if someone tried.
   */
  issueChallenge(userId: string): string {
    const payload: MfaChallengePayload = { sub: userId, purpose: 'mfa-challenge' };
    return this.jwtService.sign(payload, { expiresIn: MFA_CHALLENGE_EXPIRY });
  }

  /** Verifies a challenge token plus a TOTP or backup code, returning the
   *  user on success so the caller can issue a real access token. */
  async verifyChallenge(mfaToken: string, code: string): Promise<User> {
    let payload: MfaChallengePayload;

    try {
      payload = this.jwtService.verify<MfaChallengePayload>(mfaToken);
    } catch {
      throw new UnauthorizedException('This login attempt has expired. Please sign in again.');
    }

    if (payload.purpose !== 'mfa-challenge') {
      throw new UnauthorizedException('Invalid login session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('Invalid login session');
    }

    // otplib's verify() throws (rather than returning { valid: false }) for
    // input that isn't shaped like a TOTP token at all -- a backup code is
    // exactly that case (10 hex chars, not 6 digits), so that must fall
    // through to the backup-code check below, not bubble up as an error.
    const isValidTotp = await verify({ secret: user.mfaSecret, token: code })
      .then((result) => result.valid)
      .catch(() => false);

    if (isValidTotp) {
      return user;
    }

    // Fall back to a backup code -- single-use, consumed on success.
    for (const hash of user.mfaBackupCodeHashes) {
      if (await verifyPassword(code, hash)) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodeHashes: user.mfaBackupCodeHashes.filter((h) => h !== hash) },
        });
        return user;
      }
    }

    throw new UnauthorizedException('Incorrect code');
  }
}
