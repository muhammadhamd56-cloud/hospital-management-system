import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApprovalStatus, Role, type User } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountApprovalsService } from '../account-approvals/account-approvals.service';
import { hashPassword } from '../auth/password.util';
import { AUTH_AUDIT_EVENTS, AuthAuditService } from '../auth/auth-audit.service';

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

describe('UsersService', () => {
  let service: UsersService;
  let accountApprovalsService: { notifyAdminsOfRequest: jest.Mock };
  let authAudit: { record: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    bed: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    accountApprovalsService = { notifyAdminsOfRequest: jest.fn().mockResolvedValue(undefined) };
    authAudit = { record: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      bed: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountApprovalsService, useValue: accountApprovalsService },
        { provide: AuthAuditService, useValue: authAudit },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findById', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the user when found', async () => {
      const user = buildUser();
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.findById('user-1')).resolves.toBe(user);
    });
  });

  describe('updateProfile', () => {
    it('throws NotFoundException when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateProfile('missing', { firstName: 'New' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates only the fields provided, leaving the rest untouched', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockResolvedValue(buildUser({ phone: '555-1234' }));

      await service.updateProfile('user-1', { phone: '555-1234' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { phone: '555-1234' },
      });
    });

    it('updates firstName, lastName, and phone together when all are provided', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockResolvedValue(
        buildUser({ firstName: 'Grace', lastName: 'Hopper', phone: '555-5678' }),
      );

      await service.updateProfile('user-1', { firstName: 'Grace', lastName: 'Hopper', phone: '555-5678' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { firstName: 'Grace', lastName: 'Hopper', phone: '555-5678' },
      });
    });

    it('updates the patient-facing fields (date of birth, gender, address, emergency contact)', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockResolvedValue(buildUser());

      await service.updateProfile('user-1', {
        dateOfBirth: '1990-05-12',
        gender: 'female',
        address: '123 Main St',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+923001234567',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          dateOfBirth: new Date('1990-05-12'),
          gender: 'female',
          address: '123 Main St',
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '+923001234567',
        },
      });
    });

    it('clears date of birth, gender, address, and emergency contact when sent as empty strings', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockResolvedValue(buildUser());

      await service.updateProfile('user-1', {
        dateOfBirth: '',
        gender: '',
        address: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          dateOfBirth: null,
          gender: null,
          address: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
        },
      });
    });

    it('sends an empty data object when no fields are provided', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockResolvedValue(buildUser());

      await service.updateProfile('user-1', {});

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: {} });
    });
  });

  describe('selectRole', () => {
    it('picking doctor sets the role but leaves the account PENDING admin approval, and alerts admins', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ roleSelected: false }));
      const updated = buildUser({ role: Role.DOCTOR, roleSelected: true, approvalStatus: ApprovalStatus.PENDING });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.selectRole('user-1', 'doctor');

      expect(result).toBe(updated);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.DOCTOR, roleSelected: true, approvalStatus: ApprovalStatus.PENDING },
      });
      expect(accountApprovalsService.notifyAdminsOfRequest).toHaveBeenCalledWith(updated);
    });

    it('picking staff also needs approval', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ roleSelected: false }));
      prisma.user.update.mockResolvedValue(buildUser({ role: Role.STAFF }));

      await service.selectRole('user-1', 'staff');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ approvalStatus: ApprovalStatus.PENDING }) }),
      );
    });

    it('picking patient is approved straight away, with no admin alert', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ roleSelected: false }));
      prisma.user.update.mockResolvedValue(buildUser({ role: Role.PATIENT, roleSelected: true }));

      await service.selectRole('user-1', 'patient');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ approvalStatus: ApprovalStatus.APPROVED }) }),
      );
      expect(accountApprovalsService.notifyAdminsOfRequest).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException on a second call — role can only be picked once', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ roleSelected: true }));

      await expect(service.selectRole('user-1', 'admin')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('setPassword', () => {
    it('sets a password with no currentPassword when the account has none yet (Google-only account)', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: null }));
      prisma.user.update.mockResolvedValue(buildUser({ password: 'hashed' }));

      await service.setPassword('user-1', { newPassword: 'brandnewpass123' });

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.password).not.toBe('brandnewpass123'); // hashed
    });

    it('throws BadRequestException when the account already has a password and none is provided', async () => {
      const existingHash = await hashPassword('existing-pass');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: existingHash }));

      await expect(
        service.setPassword('user-1', { newPassword: 'brandnewpass123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when currentPassword is wrong', async () => {
      const existingHash = await hashPassword('existing-pass');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: existingHash }));

      await expect(
        service.setPassword('user-1', { currentPassword: 'wrong', newPassword: 'brandnewpass123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the password when currentPassword is correct', async () => {
      const existingHash = await hashPassword('existing-pass');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: existingHash }));
      prisma.user.update.mockResolvedValue(buildUser({ password: 'new-hashed' }));

      await service.setPassword('user-1', { currentPassword: 'existing-pass', newPassword: 'brandnewpass123' });

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('clears any login lockout when a password is set/changed', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ password: null, failedLoginAttempts: 7, lockedUntil: new Date() }),
      );
      prisma.user.update.mockResolvedValue(buildUser({ password: 'new-hashed' }));

      await service.setPassword('user-1', { newPassword: 'brandnewpass123' });

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.failedLoginAttempts).toBe(0);
      expect(updateArgs.data.lockedUntil).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('throws NotFoundException when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes the account, releasing any bed it was occupying, in one transaction', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.delete.mockResolvedValue(buildUser());

      await service.deleteAccount('user-1');

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(prisma.bed.updateMany).toHaveBeenCalledWith({
        where: { patientId: 'user-1', status: 'OCCUPIED' },
        data: { status: 'AVAILABLE', patientId: null },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('setPassword audit trail', () => {
    it('records a first password as auth.password.set, without the password', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: null }));
      prisma.user.update.mockResolvedValue(buildUser({ password: 'hashed' }));

      await service.setPassword('user-1', { newPassword: 'brandnewpass123' });

      expect(authAudit.record).toHaveBeenCalledWith(AUTH_AUDIT_EVENTS.PASSWORD_SET, {
        actorId: 'user-1',
        userId: 'user-1',
        metadata: { required: false },
      });
      expect(JSON.stringify(authAudit.record.mock.calls)).not.toContain('brandnewpass123');
    });

    it('records a change of an existing password as auth.password.changed, flagging a forced change', async () => {
      const existingHash = await hashPassword('existing-pass');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: existingHash, mustChangePassword: true }));
      prisma.user.update.mockResolvedValue(buildUser({ password: 'new-hashed' }));

      await service.setPassword('user-1', { currentPassword: 'existing-pass', newPassword: 'brandnewpass123' });

      expect(authAudit.record).toHaveBeenCalledWith(AUTH_AUDIT_EVENTS.PASSWORD_CHANGED, {
        actorId: 'user-1',
        userId: 'user-1',
        metadata: { required: true },
      });
      const logged = JSON.stringify(authAudit.record.mock.calls);
      expect(logged).not.toMatch(/existing-pass|brandnewpass123/);
    });

    it('does not record a rejected password change', async () => {
      const existingHash = await hashPassword('existing-pass');
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: existingHash }));

      await expect(
        service.setPassword('user-1', { currentPassword: 'wrong', newPassword: 'brandnewpass123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authAudit.record).not.toHaveBeenCalled();
    });
  });
});
