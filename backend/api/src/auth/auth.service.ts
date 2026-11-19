import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ApprovalStatus, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AccountApprovalsService, requiresApproval } from '../account-approvals/account-approvals.service';
import { toClientRole, toPrismaRole } from '../common/role.mapper';
import type { GoogleProfilePayload } from './types/google-profile.interface';
import type { JwtPayload, RefreshTokenPayload } from './types/jwt-payload.interface';
import type { IssuedTokens } from './auth-cookies';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import { hashPassword, needsRehash, verifyPassword } from './password.util';
import { AUTH_AUDIT_EVENTS, AuthAuditService, type AuthAuditMetadata } from './auth-audit.service';

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

const PASSWORD_RESET_EXPIRY_MINUTES = 15;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

/**
 * Account-level brute-force guard for loginLocal, on top of (not instead of)
 * the per-IP @Throttle on POST /auth/login -- IP throttling alone doesn't
 * stop a distributed attempt (many IPs, one target account). Always a
 * temporary lock, never permanent, so a legitimate user recovers on their
 * own without needing support to intervene.
 */
const LOGIN_MAX_FAILED_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MINUTES = 15;

/** A real bcrypt hash (current cost) of a random value, compared against
 *  when the email is unknown so that path costs the same as a wrong password. */
const TIMING_DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly accountApprovalsService: AccountApprovalsService,
    private readonly authAudit: AuthAuditService,
  ) {}

  /**
   * Finds the user by email, creating one on first login (default role PATIENT).
   * Refreshes googleId/picture on existing users in case either changed on Google's side.
   * Google has already verified this email address, so no OTP step is needed.
   */
  async validateGoogleUser(profile: GoogleProfilePayload): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (existing) {
      const user =
        existing.googleId !== profile.googleId || existing.picture !== profile.picture
          ? await this.prisma.user.update({
              where: { id: existing.id },
              data: { googleId: profile.googleId, picture: profile.picture },
            })
          : existing;
      await this.recordGoogleLogin(user, false);
      return user;
    }

    this.logger.log(`Creating new user for ${profile.email}`);

    const created = await this.prisma.user.create({
      data: {
        googleId: profile.googleId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        picture: profile.picture,
        role: Role.PATIENT,
        emailVerified: true,
      },
    });
    await this.recordGoogleLogin(created, true);
    return created;
  }

  /**
   * Manual email/password signup. Unlike the Google flow, the role is chosen
   * explicitly here, so roleSelected is true immediately -- no post-signup
   * role picker needed for these accounts. The account starts unverified;
   * an OTP is emailed immediately and no access token is issued until
   * `verifyOtp` succeeds.
   */
  async signupLocal(dto: SignupDto): Promise<User> {
    if ((dto.role as string) === 'admin') {
      throw new ForbiddenException('Admin accounts cannot be self-registered');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const password = await hashPassword(dto.password);

    this.logger.log(`Creating new local user for ${dto.email}`);

    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: toPrismaRole(dto.role),
          roleSelected: true,
          emailVerified: false,
          // Doctor/staff roles open up patient data -- an admin must vet them first.
          approvalStatus: requiresApproval(toPrismaRole(dto.role)) ? ApprovalStatus.PENDING : ApprovalStatus.APPROVED,
        },
      });

      if (dto.role === 'doctor') {
        const department = await tx.department.upsert({
          where: { name: dto.department! },
          update: {},
          create: { name: dto.department! },
        });

        await tx.doctor.create({
          data: {
            specialization: dto.specialization!,
            departmentId: department.id,
            bio: dto.bio!,
            experienceYears: dto.experienceYears!,
            userId: user.id,
          },
        });
      }

      return user;
    });

    try {
      await this.generateAndSendOtp(user);
    } catch (error) {
      // The account and its OTP hash are already committed above — that
      // part genuinely succeeded. Don't turn a real signup into an apparent
      // 500 failure (which would also permanently block re-signup with this
      // email via the duplicate-email check) just because the email
      // couldn't be delivered. The user can retry via "Resend code"; the
      // underlying send failure is already logged by EmailService.
      this.logger.error(
        `Signup for ${user.email} succeeded but the OTP email failed to send`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return user;
  }

  private async generateAndSendOtp(user: User): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCodeHash: codeHash, otpExpiresAt: expiresAt, otpAttempts: 0, otpLastSentAt: new Date() },
    });

    await this.emailService.sendOtpEmail(user.email, code);
  }

  /**
   * Silently no-ops for an unknown email rather than throwing -- same
   * enumeration reasoning as requestPasswordReset below. The controller
   * always returns the same "Verification code sent" message either way.
   */
  async resendOtp(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.log(`OTP resend requested for an email with no account: ${email}`);
      return;
    }

    if (user.emailVerified) {
      throw new BadRequestException('This account is already verified');
    }

    if (user.otpLastSentAt) {
      const secondsSinceLastSend = (Date.now() - user.otpLastSentAt.getTime()) / 1000;

      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
        throw new BadRequestException(`Please wait ${wait}s before requesting another code`);
      }
    }

    await this.generateAndSendOtp(user);
  }

  /**
   * An unknown email and "no code was ever requested" are deliberately the
   * same error (message and exception type) -- otherwise this endpoint
   * would let anyone probe arbitrary addresses for account existence.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (user?.emailVerified) {
      throw new BadRequestException('This account is already verified');
    }

    if (!user || !user.otpCodeHash || !user.otpExpiresAt) {
      throw new BadRequestException('No verification code was requested. Please request a new one.');
    }

    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new ForbiddenException('Too many incorrect attempts. Please request a new code.');
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This code has expired. Please request a new one.');
    }

    // Spend an attempt BEFORE checking the code, atomically: a burst of
    // parallel guesses would otherwise all read the same attempt count and
    // get far more than OTP_MAX_ATTEMPTS tries at a 6-digit code.
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, otpCodeHash: user.otpCodeHash, otpAttempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { otpAttempts: { increment: 1 } },
    });

    if (claimed.count === 0) {
      throw new ForbiddenException('Too many incorrect attempts. Please request a new code.');
    }

    if (!(await verifyPassword(dto.code, user.otpCodeHash))) {
      throw new UnauthorizedException('Incorrect code');
    }

    const verified = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0, otpLastSentAt: null },
    });

    // Only now -- with a proven email -- does the request reach the admins' queue.
    // The email is already verified at this point: a failed admin notification
    // must not turn this into a 500 (the user would think verification failed).
    if (verified.approvalStatus === ApprovalStatus.PENDING) {
      try {
        await this.accountApprovalsService.notifyAdminsOfRequest(verified);
      } catch (error) {
        this.logger.error(
          `Approval request notification failed for user ${verified.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return verified;
  }

  async loginLocal(dto: LoginDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.password) {
      // Spend the same bcrypt time as a real wrong-password check, so response
      // timing doesn't reveal whether the email is registered.
      await verifyPassword(dto.password, await TIMING_DUMMY_HASH);
      await this.recordInvalidCredentials(dto.email);
      throw new UnauthorizedException(
        user
          ? 'This account uses Google sign-in. Use "Continue with Google" instead.'
          : 'Invalid email or password',
      );
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      await this.recordFailedLogin(user.id, 'account_locked');
      throw new ForbiddenException(
        `Too many failed sign-in attempts. Please try again in ${minutesLeft} minute(s).`,
      );
    }

    const isValid = await verifyPassword(dto.password, user.password);

    if (!isValid) {
      await this.registerFailedLogin(user);
      await this.recordInvalidCredentials(dto.email);
      throw new UnauthorizedException('Invalid email or password');
    }

    // A correct password proves this is the real account holder, not an
    // attacker guessing -- clear any accumulated lockout state and take the
    // opportunity to lazily upgrade a hash made under an older, lower bcrypt
    // cost (see needsRehash) without ever forcing a mass password reset.
    const recovery: { failedLoginAttempts?: number; lockedUntil?: null; password?: string } = {};
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      recovery.failedLoginAttempts = 0;
      recovery.lockedUntil = null;
    }
    if (needsRehash(user.password)) {
      recovery.password = await hashPassword(dto.password);
    }
    if (Object.keys(recovery).length > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: recovery });
    }

    const actualRole = toClientRole(user.role);

    if (actualRole !== dto.role) {
      await this.recordFailedLogin(user.id, 'role_mismatch');
      throw new ForbiddenException(
        `This account is registered as ${actualRole}, not ${dto.role}`,
      );
    }

    if (!user.emailVerified) {
      await this.recordFailedLogin(user.id, 'email_unverified');
      throw new ForbiddenException('Please verify your email before signing in');
    }

    // For an MFA account the session only starts after POST /auth/mfa/verify,
    // which records auth.mfa.challenge_succeeded (or _failed) on its own.
    await this.authAudit.record(AUTH_AUDIT_EVENTS.LOGIN_SUCCEEDED, {
      actorId: user.id,
      userId: user.id,
      metadata: { method: 'password', mfaPending: user.mfaEnabled },
    });

    return user;
  }

  /** A failure for an account that is known to exist (locked, wrong role,
   *  unverified). No actor, since nobody is authenticated. */
  private recordFailedLogin(userId: string, reason: NonNullable<AuthAuditMetadata['reason']>): Promise<void> {
    return this.authAudit.record(AUTH_AUDIT_EVENTS.LOGIN_FAILED, {
      actorId: null,
      userId,
      metadata: { method: 'password', reason },
    });
  }

  /** Unknown email, Google-only account and wrong password all produce the
   *  identical row (no actor, unattributed entity, same reason), so the trail
   *  does not reveal which happened. A one-way hash of the normalised email
   *  lets repeated attempts on one address be correlated; neither the email
   *  nor the password is stored. */
  private recordInvalidCredentials(email: string): Promise<void> {
    const emailHash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return this.authAudit.record(AUTH_AUDIT_EVENTS.LOGIN_FAILED, {
      actorId: null,
      userId: null,
      metadata: { method: 'password', reason: 'invalid_credentials', emailHash },
    });
  }

  /** Google proved the email; for an MFA account the session still waits on
   *  POST /auth/mfa/verify, which records its own outcome. */
  private recordGoogleLogin(user: User, newAccount: boolean): Promise<void> {
    return this.authAudit.record(AUTH_AUDIT_EVENTS.GOOGLE_LOGIN, {
      actorId: user.id,
      userId: user.id,
      metadata: { method: 'google', mfaPending: user.mfaEnabled, newAccount },
    });
  }

  /** Increments the account's failed-login counter and, once it crosses
   *  LOGIN_MAX_FAILED_ATTEMPTS, locks it for LOGIN_LOCKOUT_MINUTES. */
  private async registerFailedLogin(user: User): Promise<void> {
    // A lockout that has already expired starts a fresh count -- otherwise one
    // typo after waiting it out re-locks the account immediately.
    const lockExpired = user.lockedUntil !== null && user.lockedUntil.getTime() <= Date.now();
    const attempts = (lockExpired ? 0 : user.failedLoginAttempts) + 1;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(attempts >= LOGIN_MAX_FAILED_ATTEMPTS && {
          lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000),
        }),
      },
    });
  }

  /**
   * Always resolves the same way regardless of whether the email belongs to
   * an account (or the resend cooldown is still active) — a "forgot
   * password" endpoint that reveals account existence via its response is a
   * classic enumeration vector, so the controller always returns the same
   * generic message no matter what happens in here.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.log(`Password reset requested for an email with no account: ${email}`);
      return;
    }

    if (user.passwordResetLastSentAt) {
      const secondsSinceLastSend = (Date.now() - user.passwordResetLastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS) {
        return;
      }
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60_000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: expiresAt,
        passwordResetAttempts: 0,
        passwordResetLastSentAt: new Date(),
      },
    });

    try {
      await this.emailService.sendPasswordResetEmail(user.email, code);
    } catch (error) {
      // Same reasoning as signupLocal's OTP send: the reset code is already
      // committed, so a delivery failure doesn't change what the caller
      // should be told (nothing, either way) -- just log it for ops.
      this.logger.error(
        `Password reset requested for ${user.email} but the email failed to send`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Every failure -- unknown email, no reset pending, wrong code, expired,
   * out of attempts -- is the same 400 with the same message. Anyone can
   * trigger forgot-password for any address, so distinguishable failures
   * here (the old "Incorrect code" 401 vs "Invalid" 400) would confirm
   * which addresses have accounts.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const invalid = () =>
      new BadRequestException('Invalid or expired reset code. If you have tried several times, request a new code.');
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      throw invalid();
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw invalid();
    }

    // Spend an attempt atomically before comparing -- see verifyOtp.
    const claimed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        passwordResetCodeHash: user.passwordResetCodeHash,
        passwordResetAttempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS },
      },
      data: { passwordResetAttempts: { increment: 1 } },
    });

    if (claimed.count === 0 || !(await verifyPassword(dto.code, user.passwordResetCodeHash))) {
      throw invalid();
    }

    const password = await hashPassword(dto.newPassword);

    // Conditional on the code still being the one just checked, so a code
    // is single-use even when two requests with it arrive together.
    const reset = await this.prisma.user.updateMany({
      where: { id: user.id, passwordResetCodeHash: user.passwordResetCodeHash },
      data: {
        password,
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null,
        passwordResetAttempts: 0,
        passwordResetLastSentAt: null,
        // A successful reset should also sign out every existing session --
        // including an attacker's, if that's who has this account's inbox.
        tokenVersion: { increment: 1 },
        // Proving control of the inbox is itself strong evidence this is the
        // real owner -- clear any login lockout so they aren't stuck locked
        // out immediately after resetting the very password that unlocks it.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    if (reset.count === 0) {
      throw invalid();
    }

    // Not signed in, but proving the emailed code makes the owner the actor.
    await this.authAudit.record(AUTH_AUDIT_EVENTS.PASSWORD_RESET, { actorId: user.id, userId: user.id });
  }

  issueAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    return this.jwtService.sign(payload);
  }

  /** Issues a short-lived access token plus a longer-lived refresh token.
   *  The refresh token is signed with its own secret and tagged with
   *  `purpose`, so it can never be replayed as an access token. */
  issueTokens(user: User): IssuedTokens {
    const accessToken = this.issueAccessToken(user);
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      tokenVersion: user.tokenVersion,
      purpose: 'refresh',
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as JwtSignOptions['expiresIn'],
    });

    return {
      accessToken,
      accessExpiresAt: this.expiryOf(accessToken),
      refreshToken,
      refreshExpiresAt: this.expiryOf(refreshToken),
    };
  }

  /** Exchanges a valid refresh token for a fresh token pair. Fails once the
   *  user logs out (or resets their password), since both bump tokenVersion. */
  async refreshSession(refreshToken: string | undefined): Promise<{ user: User; tokens: IssuedTokens }> {
    if (!refreshToken) {
      throw new UnauthorizedException('No active session');
    }

    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    if (payload.purpose !== 'refresh') {
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked, please sign in again');
    }

    return { user, tokens: this.issueTokens(user) };
  }

  /**
   * Works out whose session a logout request is ending, without requiring a
   * live access token: the access cookie lives 15 minutes, so a user who's
   * been idle longer still holds only the refresh cookie -- and that's the
   * one that must die, or the next page load silently signs them back in.
   * Returns null when neither token verifies (nothing to revoke).
   */
  async findSessionOwner(tokens: { refreshToken?: string; accessToken?: string }): Promise<User | null> {
    const candidates: { token: string | undefined; secret: string | undefined; purpose: 'refresh' | undefined }[] = [
      { token: tokens.refreshToken, secret: this.configService.get<string>('jwt.refreshSecret'), purpose: 'refresh' },
      { token: tokens.accessToken, secret: this.configService.get<string>('jwt.secret'), purpose: undefined },
    ];

    for (const { token, secret, purpose } of candidates) {
      if (!token) continue;
      try {
        const payload = this.jwtService.verify<{ sub: string; tokenVersion: number; purpose?: string }>(token, {
          secret,
        });
        if (payload.purpose !== purpose) continue;

        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        // An already-revoked token can't revoke anything new.
        if (user && user.tokenVersion === payload.tokenVersion) return user;
      } catch {
        // Expired or forged -- try the next one.
      }
    }

    return null;
  }

  private expiryOf(token: string): Date {
    const { exp } = this.jwtService.decode<{ exp: number }>(token);
    return new Date(exp * 1000);
  }

  /** Bumps tokenVersion so every token issued before this call (this device
   *  or any other) is rejected by JwtStrategy.validate() from now on. */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await this.authAudit.record(AUTH_AUDIT_EVENTS.LOGOUT, { actorId: userId, userId });
  }
}
