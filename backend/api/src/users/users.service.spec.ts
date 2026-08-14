import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password.util';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleId: null,
    email: 'ada@example.com',
    password: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    picture: null,
    role: Role.PATIENT,
    roleSelected: false,
    emailVerified: true,
    otpCodeHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLastSentAt: null,
    tokenVersion: 0,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    bed: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      bed: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
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

  describe('selectRole', () => {
    it('sets the role and roleSelected=true on first call', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ roleSelected: false }));
      const updated = buildUser({ role: Role.DOCTOR, roleSelected: true });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.selectRole('user-1', 'doctor');

      expect(result).toBe(updated);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.DOCTOR, roleSelected: true },
      });
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
});
