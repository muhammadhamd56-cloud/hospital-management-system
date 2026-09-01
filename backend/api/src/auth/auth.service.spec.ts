import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { hashPassword } from './password.util';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleId: null,
    email: 'ada@example.com',
    password: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: null,
    picture: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContact: null,
    role: Role.PATIENT,
    roleSelected: false,
    emailVerified: true,
    otpCodeHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLastSentAt: null,
    passwordResetCodeHash: null,
    passwordResetExpiresAt: null,
    passwordResetAttempts: 0,
    passwordResetLastSentAt: null,
    tokenVersion: 0,
    mustChangePassword: false,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodeHashes: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let emailService: { sendOtpEmail: jest.Mock; sendPasswordResetEmail: jest.Mock };
  let tx: { user: { create: jest.Mock }; doctor: { create: jest.Mock }; department: { upsert: jest.Mock } };

  beforeEach(async () => {
    tx = {
      user: { create: jest.fn() },
      doctor: { create: jest.fn() },
      department: { upsert: jest.fn() },
    };

    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    };

    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    emailService = {
      sendOtpEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('signupLocal', () => {
    const patientDto: SignupDto = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'longenough1',
      role: 'patient',
    };

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(service.signupLocal(patientDto)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('creates an unverified patient user with a hashed password and no Doctor row', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser({ role: Role.PATIENT, roleSelected: true, emailVerified: false });
      tx.user.create.mockResolvedValue(created);
      prisma.user.update.mockResolvedValue(created);

      const result = await service.signupLocal(patientDto);

      expect(result).toBe(created);
      expect(tx.user.create).toHaveBeenCalledTimes(1);
      const createArgs = tx.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toBe('ada@example.com');
      expect(createArgs.data.password).not.toBe('longenough1'); // hashed, not plaintext
      expect(createArgs.data.role).toBe(Role.PATIENT);
      expect(createArgs.data.roleSelected).toBe(true);
      expect(createArgs.data.emailVerified).toBe(false);
      expect(tx.doctor.create).not.toHaveBeenCalled();
    });

    it('creates a linked Doctor row when role is doctor', async () => {
      const doctorDto: SignupDto = {
        ...patientDto,
        role: 'doctor',
        specialization: 'Cardiology',
        department: 'Cardiology',
        bio: 'Heart stuff',
        experienceYears: 10,
      };
      prisma.user.findUnique.mockResolvedValue(null);
      const createdUser = buildUser({ id: 'doc-user-1', role: Role.DOCTOR, roleSelected: true });
      tx.user.create.mockResolvedValue(createdUser);
      tx.department.upsert.mockResolvedValue({ id: 'dept-1', name: 'Cardiology' });
      prisma.user.update.mockResolvedValue(createdUser);

      await service.signupLocal(doctorDto);

      expect(tx.department.upsert).toHaveBeenCalledWith({
        where: { name: 'Cardiology' },
        update: {},
        create: { name: 'Cardiology' },
      });
      expect(tx.doctor.create).toHaveBeenCalledTimes(1);
      const doctorArgs = tx.doctor.create.mock.calls[0][0];
      expect(doctorArgs.data).toMatchObject({
        specialization: 'Cardiology',
        departmentId: 'dept-1',
        bio: 'Heart stuff',
        experienceYears: 10,
        userId: 'doc-user-1',
      });
    });

    it('generates a 6-digit OTP, stores its hash, and emails it to the new user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser({ emailVerified: false });
      tx.user.create.mockResolvedValue(created);
      prisma.user.update.mockResolvedValue(created);

      await service.signupLocal(patientDto);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.otpCodeHash).toBeDefined();
      expect(updateArgs.data.otpCodeHash).not.toMatch(/^\d{6}$/); // hashed, not the raw code
      expect(updateArgs.data.otpExpiresAt).toBeInstanceOf(Date);
      expect(updateArgs.data.otpAttempts).toBe(0);

      expect(emailService.sendOtpEmail).toHaveBeenCalledTimes(1);
      const [to, code] = emailService.sendOtpEmail.mock.calls[0];
      expect(to).toBe('ada@example.com');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('regression: still returns the created user even when the OTP email fails to send — the account was already committed and should not appear to have failed', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser({ emailVerified: false });
      tx.user.create.mockResolvedValue(created);
      prisma.user.update.mockResolvedValue(created);
      emailService.sendOtpEmail.mockRejectedValue(new Error('Resend rejected the recipient'));

      const result = await service.signupLocal(patientDto);

      expect(result).toBe(created);
    });
  });

  describe('loginLocal', () => {
    const loginDto: LoginDto = { email: 'ada@example.com', password: 'correct-password', role: 'patient' };

    it('throws UnauthorizedException with a generic message for a nonexistent email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.loginLocal(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('throws UnauthorizedException with the Google-sign-in message for a password-less account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: null, googleId: 'g-1' }));

      await expect(service.loginLocal(loginDto)).rejects.toThrow(
        'This account uses Google sign-in. Use "Continue with Google" instead.',
      );
    });

    it('throws UnauthorizedException with a generic message for a wrong password', async () => {
      const hashed = await hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: hashed }));

      await expect(
        service.loginLocal({ ...loginDto, password: 'wrong-password' }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('throws ForbiddenException when the role claimed at login does not match the account', async () => {
      const hashed = await hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: hashed, role: Role.DOCTOR }));

      await expect(service.loginLocal(loginDto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when the account has not verified its email yet', async () => {
      const hashed = await hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ password: hashed, role: Role.PATIENT, emailVerified: false }),
      );

      await expect(service.loginLocal(loginDto)).rejects.toThrow(
        'Please verify your email before signing in',
      );
    });

    it('returns the user on valid credentials, matching role, and a verified email', async () => {
      const hashed = await hashPassword('correct-password');
      const user = buildUser({ password: hashed, role: Role.PATIENT, emailVerified: true });
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.loginLocal(loginDto);

      expect(result).toBe(user);
    });
  });

  describe('verifyOtp', () => {
    const email = 'ada@example.com';

    async function otpUser(rawCode: string, overrides: Partial<User> = {}) {
      const otpCodeHash = await hashPassword(rawCode);
      return buildUser({
        email,
        emailVerified: false,
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 10 * 60_000),
        otpAttempts: 0,
        ...overrides,
      });
    }

    it('throws NotFoundException when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the account is already verified', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email, emailVerified: true }));

      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when no code was ever requested', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ email, emailVerified: false, otpCodeHash: null, otpExpiresAt: null }),
      );

      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws ForbiddenException after the max number of incorrect attempts', async () => {
      const user = await otpUser('123456', { otpAttempts: 5 });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyOtp({ email, code: '999999' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the code has expired', async () => {
      const user = await otpUser('123456', { otpExpiresAt: new Date(Date.now() - 1000) });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException and increments attempts on an incorrect code', async () => {
      const user = await otpUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyOtp({ email, code: '000000' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      });
    });

    it('marks the account verified and clears OTP fields on a correct code', async () => {
      const user = await otpUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);
      const verified = buildUser({ email, emailVerified: true });
      prisma.user.update.mockResolvedValue(verified);

      const result = await service.verifyOtp({ email, code: '123456' } as VerifyOtpDto);

      expect(result).toBe(verified);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0, otpLastSentAt: null },
      });
    });
  });

  describe('resendOtp', () => {
    const email = 'ada@example.com';

    it('throws NotFoundException when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resendOtp(email)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the account is already verified', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email, emailVerified: true }));

      await expect(service.resendOtp(email)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when still within the resend cooldown', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ email, emailVerified: false, otpLastSentAt: new Date() }),
      );

      await expect(service.resendOtp(email)).rejects.toBeInstanceOf(BadRequestException);
      expect(emailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('generates and sends a new code once the cooldown has elapsed', async () => {
      const user = buildUser({
        email,
        emailVerified: false,
        otpLastSentAt: new Date(Date.now() - 61_000),
      });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.resendOtp(email);

      expect(emailService.sendOtpEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendOtpEmail.mock.calls[0][0]).toBe(email);
    });

    it('sends a code immediately when no code has ever been sent before', async () => {
      const user = buildUser({ email, emailVerified: false, otpLastSentAt: null });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.resendOtp(email);

      expect(emailService.sendOtpEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestPasswordReset', () => {
    const email = 'ada@example.com';

    it('resolves without error and never emails when the account does not exist -- must not reveal that', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.requestPasswordReset(email)).resolves.toBeUndefined();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('resolves without error and never emails again when still within the resend cooldown', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email, passwordResetLastSentAt: new Date() }));

      await expect(service.requestPasswordReset(email)).resolves.toBeUndefined();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('generates a 6-digit code, stores its hash, and emails it once the cooldown has elapsed', async () => {
      const user = buildUser({ email, passwordResetLastSentAt: new Date(Date.now() - 61_000) });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.requestPasswordReset(email);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.passwordResetCodeHash).toBeDefined();
      expect(updateArgs.data.passwordResetCodeHash).not.toMatch(/^\d{6}$/); // hashed, not the raw code
      expect(updateArgs.data.passwordResetExpiresAt).toBeInstanceOf(Date);
      expect(updateArgs.data.passwordResetAttempts).toBe(0);

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [to, code] = emailService.sendPasswordResetEmail.mock.calls[0];
      expect(to).toBe(email);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('sends a code immediately when no reset has ever been requested before', async () => {
      const user = buildUser({ email, passwordResetLastSentAt: null });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.requestPasswordReset(email);

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('resolves without error even when the reset email fails to send -- the code is already committed', async () => {
      const user = buildUser({ email, passwordResetLastSentAt: null });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('Resend rejected the recipient'));

      await expect(service.requestPasswordReset(email)).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    const email = 'ada@example.com';
    const dto: ResetPasswordDto = { email, code: '123456', newPassword: 'longenough2' };

    async function resetUser(rawCode: string, overrides: Partial<User> = {}) {
      const passwordResetCodeHash = await hashPassword(rawCode);
      return buildUser({
        email,
        passwordResetCodeHash,
        passwordResetExpiresAt: new Date(Date.now() + 15 * 60_000),
        passwordResetAttempts: 0,
        ...overrides,
      });
    }

    it('throws BadRequestException when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when no reset was ever requested', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ email, passwordResetCodeHash: null, passwordResetExpiresAt: null }),
      );

      await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException after the max number of incorrect attempts', async () => {
      const user = await resetUser('123456', { passwordResetAttempts: 5 });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.resetPassword({ ...dto, code: '999999' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the code has expired', async () => {
      const user = await resetUser('123456', { passwordResetExpiresAt: new Date(Date.now() - 1000) });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws UnauthorizedException and increments attempts on an incorrect code', async () => {
      const user = await resetUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.resetPassword({ ...dto, code: '000000' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { passwordResetAttempts: { increment: 1 } },
      });
    });

    it('sets the new hashed password, clears reset fields, and bumps tokenVersion on a correct code', async () => {
      const user = await resetUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(buildUser({ email }));

      await service.resetPassword(dto);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: user.id });
      expect(updateArgs.data.password).not.toBe('longenough2'); // hashed, not plaintext
      expect(updateArgs.data.passwordResetCodeHash).toBeNull();
      expect(updateArgs.data.passwordResetExpiresAt).toBeNull();
      expect(updateArgs.data.passwordResetAttempts).toBe(0);
      expect(updateArgs.data.passwordResetLastSentAt).toBeNull();
      expect(updateArgs.data.tokenVersion).toEqual({ increment: 1 });
    });
  });

  describe('issueAccessToken', () => {
    it('signs a JWT payload containing sub, email, role, and tokenVersion', () => {
      const user = buildUser({
        id: 'user-42',
        email: 'ada@example.com',
        role: Role.DOCTOR,
        tokenVersion: 3,
      });

      const token = service.issueAccessToken(user);

      expect(token).toBe('signed.jwt.token');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-42',
        email: 'ada@example.com',
        role: Role.DOCTOR,
        tokenVersion: 3,
      });
    });
  });

  describe('logout', () => {
    it('increments tokenVersion so previously issued tokens stop validating', async () => {
      prisma.user.update.mockResolvedValue(buildUser({ tokenVersion: 1 }));

      await service.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });
});
