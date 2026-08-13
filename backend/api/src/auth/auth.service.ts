import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { toClientRole, toPrismaRole } from '../common/role.mapper';
import type { GoogleProfilePayload } from './types/google-profile.interface';
import type { JwtPayload } from './types/jwt-payload.interface';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';
import { hashPassword, verifyPassword } from './password.util';

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Finds the user by email, creating one on first login (default role PATIENT).
   * Refreshes googleId/picture on existing users in case either changed on Google's side.
   * Google has already verified this email address, so no OTP step is needed.
   */
  async validateGoogleUser(profile: GoogleProfilePayload): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (existing) {
      if (existing.googleId !== profile.googleId || existing.picture !== profile.picture) {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { googleId: profile.googleId, picture: profile.picture },
        });
      }
      return existing;
    }

    this.logger.log(`Creating new user for ${profile.email}`);

    return this.prisma.user.create({
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

  async resendOtp(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('Account not found');
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

  async verifyOtp(dto: VerifyOtpDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('This account is already verified');
    }

    if (!user.otpCodeHash || !user.otpExpiresAt) {
      throw new BadRequestException('No verification code was requested. Please request a new one.');
    }

    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new ForbiddenException('Too many incorrect attempts. Please request a new code.');
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This code has expired. Please request a new one.');
    }

    const isValid = await verifyPassword(dto.code, user.otpCodeHash);

    if (!isValid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Incorrect code');
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0, otpLastSentAt: null },
    });
  }

  async loginLocal(dto: LoginDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.password) {
      throw new UnauthorizedException(
        user
          ? 'This account uses Google sign-in. Use "Continue with Google" instead.'
          : 'Invalid email or password',
      );
    }

    const isValid = await verifyPassword(dto.password, user.password);

    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const actualRole = toClientRole(user.role);

    if (actualRole !== dto.role) {
      throw new ForbiddenException(
        `This account is registered as ${actualRole}, not ${dto.role}`,
      );
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before signing in');
    }

    return user;
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

  /** Bumps tokenVersion so every token issued before this call (this device
   *  or any other) is rejected by JwtStrategy.validate() from now on. */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }
}
