import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';
import { AUTH_AUDIT_EVENTS, AuthAuditService } from './auth-audit.service';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  isEncryptedMfaSecret,
  parseMfaEncryptionKey,
} from './mfa-secret-crypto';

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

/** The plain-text fallback warning is logged once per process, not per instance. */
let warnedPlainTextSecrets = false;

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  /** Null only outside production (env validation requires the key there). */
  private readonly encryptionKey: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authAudit: AuthAuditService,
  ) {
    const rawKey = this.configService.get<string>('mfa.encryptionKey');
    this.encryptionKey = rawKey ? parseMfaEncryptionKey(rawKey) : null;

    if (!this.encryptionKey) {
      // Belt and braces: validateEnv already refuses to boot without it.
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MFA_ENCRYPTION_KEY is required in production');
      }
      if (!warnedPlainTextSecrets) {
        warnedPlainTextSecrets = true;
        this.logger.warn(
          'MFA_ENCRYPTION_KEY is not set: MFA secrets are stored unencrypted. Set it before using real accounts.',
        );
      }
    }
  }

  /** What to write to User.mfaSecret: ciphertext when a key is configured. */
  private sealSecret(plain: string, userId: string): string {
    return this.encryptionKey ? encryptMfaSecret(plain, this.encryptionKey, userId) : plain;
  }

  /** Decrypts (or passes through a legacy plain-text) stored secret. A value
   *  that can't be decrypted fails closed with a generic 500; neither the
   *  secret nor the key is logged. */
  private openSecret(user: User): string {
    try {
      return decryptMfaSecret(user.mfaSecret as string, this.encryptionKey, user.id);
    } catch (error) {
      this.logger.error(`Stored MFA secret for user ${user.id} could not be decrypted: ${(error as Error).message}`);
      throw new InternalServerErrorException('Two-factor authentication is temporarily unavailable');
    }
  }

  /** A legacy plain-text secret that just verified a code gets re-encrypted
   *  in the same write. Undefined (no change) otherwise. */
  private upgradedSecret(user: User, plain: string): string | undefined {
    return this.encryptionKey && !isEncryptedMfaSecret(user.mfaSecret as string)
      ? this.sealSecret(plain, user.id)
      : undefined;
  }

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
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: this.sealSecret(secret, userId) } });

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
    const secret = this.openSecret(user);
    const isValid = await verify({ secret, token: code })
      .then((result) => result.valid)
      .catch(() => false);

    if (!isValid) {
      throw new UnauthorizedException('Incorrect code');
    }

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'));
    const hashes = await Promise.all(backupCodes.map((c) => hashPassword(c)));
    const upgraded = this.upgradedSecret(user, secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaBackupCodeHashes: hashes, ...(upgraded && { mfaSecret: upgraded }) },
    });

    await this.authAudit.record(AUTH_AUDIT_EVENTS.MFA_ENABLED, { actorId: userId, userId });

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

    await this.authAudit.record(AUTH_AUDIT_EVENTS.MFA_DISABLED, { actorId: userId, userId });
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

    const secret = this.openSecret(user);
    const verified = await this.checkCode(user, secret, code);

    if (!verified) {
      const locked = await this.registerFailedAttempt(user);
      // Not yet authenticated, so no actor -- the row is filed under the account.
      await this.authAudit.record(AUTH_AUDIT_EVENTS.MFA_CHALLENGE_FAILED, {
        actorId: null,
        userId: user.id,
        metadata: { reason: 'invalid_code', locked },
      });
      throw new UnauthorizedException('Incorrect code');
    }

    const upgraded = this.upgradedSecret(user, secret);

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
        // Lazy migration of a legacy plain-text secret that just proved valid.
        ...(upgraded && { mfaSecret: upgraded }),
      },
    });

    if (consumed.count === 0) {
      throw new UnauthorizedException('This login attempt has expired. Please sign in again.');
    }

    await this.authAudit.record(AUTH_AUDIT_EVENTS.MFA_CHALLENGE_SUCCEEDED, {
      actorId: user.id,
      userId: user.id,
      metadata: { method: 'mfa', factor: verified.usedBackupHash ? 'backup_code' : 'totp' },
    });

    return user;
  }

  /** TOTP first, then a single-use backup code. Returns null if neither matches. */
  private async checkCode(
    user: User,
    secret: string,
    code: string,
  ): Promise<{ usedBackupHash: string | null } | null> {
    // otplib's verify() throws (rather than returning { valid: false }) for
    // input that isn't shaped like a TOTP token at all -- a backup code is
    // exactly that case (10 hex chars, not 6 digits), so that must fall
    // through to the backup-code check below, not bubble up as an error.
    const isValidTotp = await verify({ secret, token: code })
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
   *  step and kills the outstanding challenge (forcing a fresh password login).
   *  Returns whether this attempt triggered the lock. */
  private async registerFailedAttempt(user: User): Promise<boolean> {
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

    return lock;
  }
}
