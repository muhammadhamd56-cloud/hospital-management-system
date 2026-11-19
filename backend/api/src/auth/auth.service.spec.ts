import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccountApprovalsService } from '../account-approvals/account-approvals.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ApprovalStatus, AuditAction, Role, type User } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthAuditService, UNKNOWN_USER_ENTITY_ID } from './auth-audit.service';
import type { GoogleProfilePayload } from './types/google-profile.interface';
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
    emergencyContactName: null,
    emergencyContactPhone: null,
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
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodeHashes: [],
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    mfaChallengeId: null,
    approvalStatus: ApprovalStatus.APPROVED,
    approvalReviewedAt: null,
    approvalNote: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let accountApprovalsService: { notifyAdminsOfRequest: jest.Mock };
  /** The real AuthAuditService runs on top of this, so its error handling is exercised too. */
  let auditLogService: { log: jest.Mock };
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
      // updateMany is the atomic "spend an attempt" claim; count 1 = claim succeeded.
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    };

    accountApprovalsService = { notifyAdminsOfRequest: jest.fn().mockResolvedValue(undefined) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
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
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AccountApprovalsService, useValue: accountApprovalsService },
        AuthAuditService,
        { provide: AuditLogService, useValue: auditLogService },
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
      expect(createArgs.data.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(tx.doctor.create).not.toHaveBeenCalled();
    });

    it.each(['doctor', 'staff'] as const)('creates a self-registered %s account PENDING admin approval', async (role) => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser({ role: role === 'doctor' ? Role.DOCTOR : Role.STAFF, emailVerified: false });
      tx.user.create.mockResolvedValue(created);
      tx.department.upsert.mockResolvedValue({ id: 'dept-1', name: 'Cardiology' });
      prisma.user.update.mockResolvedValue(created);

      await service.signupLocal({
        ...patientDto,
        role,
        ...(role === 'doctor'
          ? { specialization: 'Cardiology', department: 'Cardiology', bio: 'Heart stuff', experienceYears: 10 }
          : {}),
      });

      expect(tx.user.create.mock.calls[0][0].data.approvalStatus).toBe(ApprovalStatus.PENDING);
      // Not yet: the email isn't proven, so the request isn't in the admins' queue.
      expect(accountApprovalsService.notifyAdminsOfRequest).not.toHaveBeenCalled();
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

    describe('account lockout (brute-force protection independent of the per-IP throttle)', () => {
      it('increments failedLoginAttempts on a wrong password', async () => {
        const hashed = await hashPassword('correct-password');
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ id: 'user-1', password: hashed, failedLoginAttempts: 2 }),
        );

        await expect(
          service.loginLocal({ ...loginDto, password: 'wrong-password' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { failedLoginAttempts: 3 },
        });
      });

      it('locks the account once failedLoginAttempts reaches the 10-attempt threshold', async () => {
        const hashed = await hashPassword('correct-password');
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ id: 'user-1', password: hashed, failedLoginAttempts: 9 }),
        );

        await expect(
          service.loginLocal({ ...loginDto, password: 'wrong-password' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { failedLoginAttempts: 10, lockedUntil: expect.any(Date) },
        });
      });

      it('rejects a login attempt with the correct password while the account is locked, without touching the password hash', async () => {
        const hashed = await hashPassword('correct-password');
        prisma.user.findUnique.mockResolvedValue(
          buildUser({
            password: hashed,
            failedLoginAttempts: 10,
            lockedUntil: new Date(Date.now() + 5 * 60_000),
          }),
        );

        await expect(service.loginLocal(loginDto)).rejects.toThrow(
          /Too many failed sign-in attempts/,
        );
        // A locked account is rejected before spending a bcrypt comparison,
        // and definitely before any lockout-clearing write.
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('allows login again, and clears the lockout, once lockedUntil is in the past', async () => {
        const hashed = await hashPassword('correct-password');
        prisma.user.findUnique.mockResolvedValue(
          buildUser({
            id: 'user-1',
            password: hashed,
            failedLoginAttempts: 10,
            lockedUntil: new Date(Date.now() - 1000),
            role: Role.PATIENT,
            emailVerified: true,
          }),
        );

        await service.loginLocal(loginDto);

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
      });
    });

    describe('bcrypt cost migration', () => {
      it('lazily rehashes a password stored under an older, lower bcrypt cost on successful login', async () => {
        const bcrypt = jest.requireActual('bcryptjs') as typeof import('bcryptjs');
        const legacyHash = await bcrypt.hash('correct-password', 10);
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ id: 'user-1', password: legacyHash, role: Role.PATIENT, emailVerified: true }),
        );

        await service.loginLocal(loginDto);

        expect(prisma.user.update).toHaveBeenCalledTimes(1);
        const updateArgs = prisma.user.update.mock.calls[0][0];
        expect(updateArgs.where).toEqual({ id: 'user-1' });
        expect(typeof updateArgs.data.password).toBe('string');
        expect(updateArgs.data.password).not.toBe(legacyHash);
      });

      it('does not rehash a password already at the current cost', async () => {
        const hashed = await hashPassword('correct-password');
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ id: 'user-1', password: hashed, role: Role.PATIENT, emailVerified: true }),
        );

        await service.loginLocal(loginDto);

        expect(prisma.user.update).not.toHaveBeenCalled();
      });
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

    it('throws the same BadRequestException for an unknown email as for "no code requested" -- must not reveal account existence', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toThrow(
        'No verification code was requested. Please request a new one.',
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

    it('spends an attempt atomically before comparing, then throws UnauthorizedException on an incorrect code', async () => {
      const user = await otpUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyOtp({ email, code: '000000' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: user.id, otpCodeHash: user.otpCodeHash, otpAttempts: { lt: 5 } },
        data: { otpAttempts: { increment: 1 } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses without comparing when a parallel guess already spent the last attempt', async () => {
      const user = await otpUser('123456', { otpAttempts: 4 });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      // Even the correct code is refused once no attempt could be claimed.
      await expect(service.verifyOtp({ email, code: '123456' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('marks the account verified and clears OTP fields on a correct code', async () => {
      const user = await otpUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);
      const verified = buildUser({ email, emailVerified: true });
      prisma.user.update.mockResolvedValue(verified);

      const result = await service.verifyOtp({ email, code: '123456' } as VerifyOtpDto);

      expect(result).toBe(verified);
      expect(accountApprovalsService.notifyAdminsOfRequest).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0, otpLastSentAt: null },
      });
    });
  });

  describe('resendOtp', () => {
    const email = 'ada@example.com';

    it('resolves without error and never emails when the account does not exist -- must not reveal that', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resendOtp(email)).resolves.toBeUndefined();
      expect(emailService.sendOtpEmail).not.toHaveBeenCalled();
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

  describe('verifyOtp for a doctor/staff applicant', () => {
    it("puts the request in the admins' queue once the email is verified", async () => {
      const otpCodeHash = await hashPassword('123456');
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          role: Role.DOCTOR,
          emailVerified: false,
          otpCodeHash,
          otpExpiresAt: new Date(Date.now() + 60_000),
          approvalStatus: ApprovalStatus.PENDING,
        }),
      );
      const verified = buildUser({ role: Role.DOCTOR, emailVerified: true, approvalStatus: ApprovalStatus.PENDING });
      prisma.user.update.mockResolvedValue(verified);

      await service.verifyOtp({ email: 'ada@example.com', code: '123456' });

      expect(accountApprovalsService.notifyAdminsOfRequest).toHaveBeenCalledWith(verified);
    });

    it('still succeeds when notifying the admins fails -- the email is already verified', async () => {
      const otpCodeHash = await hashPassword('123456');
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          role: Role.DOCTOR,
          emailVerified: false,
          otpCodeHash,
          otpExpiresAt: new Date(Date.now() + 60_000),
          approvalStatus: ApprovalStatus.PENDING,
        }),
      );
      const verified = buildUser({ role: Role.DOCTOR, emailVerified: true, approvalStatus: ApprovalStatus.PENDING });
      prisma.user.update.mockResolvedValue(verified);
      accountApprovalsService.notifyAdminsOfRequest.mockRejectedValue(new Error('email provider down'));

      await expect(service.verifyOtp({ email: 'ada@example.com', code: '123456' })).resolves.toBe(verified);
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

    it('refuses -- even the correct code -- once no attempt can be claimed (max reached, or spent by parallel guesses)', async () => {
      const user = await resetUser('123456', { passwordResetAttempts: 5 });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fails identically for an unknown email and a wrong code, so it cannot confirm which accounts exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await service.resetPassword(dto).catch((error: Error) => error);

      prisma.user.findUnique.mockResolvedValue(await resetUser('123456'));
      const wrongCode = await service.resetPassword({ ...dto, code: '000000' }).catch((error: Error) => error);

      expect(unknown).toBeInstanceOf(BadRequestException);
      expect(wrongCode).toBeInstanceOf(BadRequestException);
      expect((wrongCode as Error).message).toBe((unknown as Error).message);
    });

    it('throws BadRequestException when the code has expired', async () => {
      const user = await resetUser('123456', { passwordResetExpiresAt: new Date(Date.now() - 1000) });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('spends an attempt atomically before comparing an incorrect code, and changes nothing else', async () => {
      const user = await resetUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.resetPassword({ ...dto, code: '000000' })).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: user.id, passwordResetCodeHash: user.passwordResetCodeHash, passwordResetAttempts: { lt: 5 } },
        data: { passwordResetAttempts: { increment: 1 } },
      });
    });

    it('sets the new hashed password, clears reset fields, and bumps tokenVersion on a correct code', async () => {
      const user = await resetUser('123456');
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(buildUser({ email }));

      await service.resetPassword(dto);

      // [0] = the attempt claim, [1] = the reset itself, conditional on the code still being current.
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
      const updateArgs = prisma.user.updateMany.mock.calls[1][0];
      expect(updateArgs.where).toEqual({ id: user.id, passwordResetCodeHash: user.passwordResetCodeHash });
      expect(updateArgs.data.password).not.toBe('longenough2'); // hashed, not plaintext
      expect(updateArgs.data.passwordResetCodeHash).toBeNull();
      expect(updateArgs.data.passwordResetExpiresAt).toBeNull();
      expect(updateArgs.data.passwordResetAttempts).toBe(0);
      expect(updateArgs.data.passwordResetLastSentAt).toBeNull();
      expect(updateArgs.data.tokenVersion).toEqual({ increment: 1 });
      expect(updateArgs.data.failedLoginAttempts).toBe(0);
      expect(updateArgs.data.lockedUntil).toBeNull();
    });

    it('treats a code already used by a simultaneous request as invalid (single use)', async () => {
      prisma.user.findUnique.mockResolvedValue(await resetUser('123456'));
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(BadRequestException);
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

  describe('authentication audit trail', () => {
    const loginDto: LoginDto = { email: 'Ada@Example.com ', password: 'correct-password', role: 'patient' };
    const emailHash = createHash('sha256').update('ada@example.com').digest('hex');

    /** Every argument ever passed to AuditLogService.log, serialised -- used to
     *  prove no password, code or token leaks into metadata. */
    const loggedText = () => JSON.stringify(auditLogService.log.mock.calls);

    it('records a successful password login against the user', async () => {
      const hashed = await hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: hashed, mfaEnabled: true }));

      await service.loginLocal(loginDto);

      expect(auditLogService.log).toHaveBeenCalledWith({
        actorId: 'user-1',
        action: AuditAction.CREATE,
        entityType: 'User',
        entityId: 'user-1',
        metadata: { event: 'auth.login.succeeded', method: 'password', mfaPending: true },
      });
      expect(loggedText()).not.toContain('correct-password');
    });

    it('records an unknown email and a wrong password identically, without the email or password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.loginLocal({ ...loginDto, password: 'guess-1' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      const hashed = await hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: hashed }));
      await expect(service.loginLocal({ ...loginDto, password: 'guess-2' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      const expected = {
        actorId: null,
        action: AuditAction.VIEW,
        entityType: 'User',
        entityId: UNKNOWN_USER_ENTITY_ID,
        metadata: { event: 'auth.login.failed', method: 'password', reason: 'invalid_credentials', emailHash },
      };
      expect(auditLogService.log).toHaveBeenNthCalledWith(1, expected);
      expect(auditLogService.log).toHaveBeenNthCalledWith(2, expected);
      expect(loggedText()).not.toMatch(/guess-1|guess-2|ada@example\.com|user-1/i);
    });

    it('records a Google-only account the same way as bad credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: null, googleId: 'g-1' }));

      await expect(service.loginLocal(loginDto)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: null, entityId: UNKNOWN_USER_ENTITY_ID }),
      );
    });

    it('records a locked account against the account, with no actor', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ password: 'hash', lockedUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(service.loginLocal(loginDto)).rejects.toBeInstanceOf(ForbiddenException);

      expect(auditLogService.log).toHaveBeenCalledWith({
        actorId: null,
        action: AuditAction.VIEW,
        entityType: 'User',
        entityId: 'user-1',
        metadata: { event: 'auth.login.failed', method: 'password', reason: 'account_locked' },
      });
    });

    it('never lets an audit failure break a successful login', async () => {
      auditLogService.log.mockRejectedValue(new Error('database down'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const hashed = await hashPassword('correct-password');
      const user = buildUser({ password: hashed });
      prisma.user.findUnique.mockResolvedValue(user);

      try {
        await expect(service.loginLocal(loginDto)).resolves.toBe(user);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('auth.login.succeeded'),
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('never lets an audit failure change the error of a failed login', async () => {
      auditLogService.log.mockRejectedValue(new Error('database down'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      prisma.user.findUnique.mockResolvedValue(null);

      try {
        await expect(service.loginLocal(loginDto)).rejects.toThrow('Invalid email or password');
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('records a Google login, flagging a newly created account', async () => {
      const profile = {
        googleId: 'g-1',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        picture: null,
      } as unknown as GoogleProfilePayload;
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser({ googleId: 'g-1' }));

      await service.validateGoogleUser(profile);

      expect(auditLogService.log).toHaveBeenCalledWith({
        actorId: 'user-1',
        action: AuditAction.CREATE,
        entityType: 'User',
        entityId: 'user-1',
        metadata: { event: 'auth.login.google', method: 'google', mfaPending: false, newAccount: true },
      });
    });

    it('records a Google login for an existing account', async () => {
      const existing = buildUser({ googleId: 'g-1', picture: null });
      prisma.user.findUnique.mockResolvedValue(existing);

      await service.validateGoogleUser({
        googleId: 'g-1',
        email: existing.email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        picture: null,
      } as unknown as GoogleProfilePayload);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ event: 'auth.login.google', newAccount: false }) }),
      );
    });

    it('records logout', async () => {
      prisma.user.update.mockResolvedValue(buildUser({ tokenVersion: 1 }));

      await service.logout('user-1');

      expect(auditLogService.log).toHaveBeenCalledWith({
        actorId: 'user-1',
        action: AuditAction.DELETE,
        entityType: 'User',
        entityId: 'user-1',
        metadata: { event: 'auth.logout' },
      });
    });

    it('records a completed password reset without the code or the new password', async () => {
      const passwordResetCodeHash = await hashPassword('123456');
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ passwordResetCodeHash, passwordResetExpiresAt: new Date(Date.now() + 60_000) }),
      );

      await service.resetPassword({ email: 'ada@example.com', code: '123456', newPassword: 'longenough2' });

      expect(auditLogService.log).toHaveBeenCalledWith({
        actorId: 'user-1',
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: 'user-1',
        metadata: { event: 'auth.password.reset' },
      });
      expect(loggedText()).not.toMatch(/123456|longenough2/);
    });

    it('does not record a password reset that failed', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ email: 'ada@example.com', code: '123456', newPassword: 'longenough2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });
});
