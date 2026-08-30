import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, type User } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../types/jwt-payload.interface';

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
    role: Role.PATIENT,
    roleSelected: true,
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

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };
  const configService = { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(configService, prisma as unknown as PrismaService);
  });

  const payload: JwtPayload = {
    sub: 'user-1',
    email: 'ada@example.com',
    role: Role.PATIENT,
    tokenVersion: 0,
  };

  it('throws UnauthorizedException when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when tokenVersion has been bumped since the token was issued', async () => {
    prisma.user.findUnique.mockResolvedValue(buildUser({ tokenVersion: 1 }));

    await expect(strategy.validate(payload)).rejects.toThrow(
      'Session has been revoked, please sign in again',
    );
  });

  it('returns the authenticated user when tokenVersion still matches', async () => {
    prisma.user.findUnique.mockResolvedValue(buildUser({ tokenVersion: 0 }));

    const result = await strategy.validate(payload);

    expect(result).toEqual({ id: 'user-1', email: 'ada@example.com', role: Role.PATIENT });
  });
});
