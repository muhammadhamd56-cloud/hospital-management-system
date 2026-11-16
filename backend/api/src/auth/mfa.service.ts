import { Injectable, BadRequestException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';

const MFA_CHALLENGE_EXPIRY = '5m';
const BACKUP_CODE_COUNT = 8;
/** Wrong codes allowed per account before the code step locks. */
const MFA_MAX_FAILED_ATTEMPTS = 5;
const MFA_LOCKOUT_MINUTES = 15;

interface MfaChallengePayload {
  sub: string;
  purpose: 'mfa-challenge';
  /** Matched against User.mfaChallengeId -- makes the challenge single-use. */
  jti: string;
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
    // Overwriting the secret of an already-enabled MFA would instantly break the
    // user's authenticator (and let a hijacked session take over the second
    // factor without the password that disable() requires).
    const existing = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (existing.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled. Disable it first to set it up again.');
    }

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
  async issueChallenge(userId: string): Promise<string> {
    const jti = randomBytes(16).toString('hex');
    // Only the newest challenge is valid; issuing one supersedes any other.
    await this.prisma.user.update({ where: { id: userId }, data: { mfaChallengeId: jti } });
    const payload: MfaChallengePayload = { sub: userId, purpose: 'mfa-challenge', jti };
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

    if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.mfaLockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Single-use: a used, superseded (newer login) or locked-out challenge no
    // longer matches the stored id.
    if (!payload.jti || payload.jti !== user.mfaChallengeId) {
      throw new UnauthorizedException('This login attempt has expired. Please sign in again.');
    }

    const verified = await this.checkCode(user, code);

    if (!verified) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Incorrect code');
    }

    // Consume the challenge atomically: of two concurrent requests with the
    // same token (and a valid code) only one gets through.
    const consumed = await this.prisma.user.updateMany({
      where: { id: user.id, mfaChallengeId: payload.jti },
      data: {
        mfaChallengeId: null,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
        ...(verified.usedBackupHash && {
          mfaBackupCodeHashes: user.mfaBackupCodeHashes.filter((h) => h !== verified.usedBackupHash),
        }),
      },
    });

    if (consumed.count === 0) {
      throw new UnauthorizedException('This login attempt has expired. Please sign in again.');
    }

    return user;
  }

  /** TOTP first, then a single-use backup code. Returns null if neither matches. */
  private async checkCode(user: User, code: string): Promise<{ usedBackupHash: string | null } | null> {
    // otplib's verify() throws (rather than returning { valid: false }) for
    // input that isn't shaped like a TOTP token at all -- a backup code is
    // exactly that case (10 hex chars, not 6 digits), so that must fall
    // through to the backup-code check below, not bubble up as an error.
    const isValidTotp = await verify({ secret: user.mfaSecret as string, token: code })
      .then((result) => result.valid)
      .catch(() => false);

    if (isValidTotp) {
      return { usedBackupHash: null };
    }

    // Fall back to a backup code -- single-use, consumed by the caller on success.
    for (const hash of user.mfaBackupCodeHashes) {
      if (await verifyPassword(code, hash)) {
        return { usedBackupHash: hash };
      }
    }

    return null;
  }

  /** Counts a wrong code against the account; at the limit, locks the code
   *  step and kills the outstanding challenge (forcing a fresh password login). */
  private async registerFailedAttempt(user: User): Promise<void> {
    const lockExpired = user.mfaLockedUntil !== null && user.mfaLockedUntil.getTime() <= Date.now();
    const attempts = (lockExpired ? 0 : user.mfaFailedAttempts) + 1;
    const lock = attempts >= MFA_MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: lock ? 0 : attempts,
        mfaLockedUntil: lock ? new Date(Date.now() + MFA_LOCKOUT_MINUTES * 60_000) : lockExpired ? null : undefined,
        ...(lock && { mfaChallengeId: null }),
      },
    });
  }
}
