import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generate, generateSecret } from 'otplib';
import { Role, type User } from '@prisma/client';
import { MfaService } from './mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './password.util';

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
    role: Role.ADMIN,
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

describe('MfaService', () => {
  let service: MfaService;
  let prisma: { user: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock } };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { update: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    };
    jwtService = { sign: jest.fn(), verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(MfaService);
  });

  describe('startSetup', () => {
    it('generates and saves a new secret, returning it with a scannable QR code', async () => {
      const result = await service.startSetup('user-1', 'ada@example.com');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaSecret: result.secret },
      });
      expect(result.secret).toEqual(expect.any(String));
      expect(result.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  describe('confirmSetup', () => {
    it('throws BadRequestException when setup was never started', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: null }));

      await expect(service.confirmSetup('user-1', '123456')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for an incorrect code', async () => {
      const secret = generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: secret }));

      await expect(service.confirmSetup('user-1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('enables MFA and returns 8 backup codes for a correct code', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: secret }));

      const result = await service.confirmSetup('user-1', code);

      expect(result.backupCodes).toHaveLength(8);
      expect(new Set(result.backupCodes).size).toBe(8);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaEnabled: true, mfaBackupCodeHashes: expect.any(Array) },
      });
      const savedHashes: string[] = prisma.user.update.mock.calls[0][0].data.mfaBackupCodeHashes;
      expect(savedHashes).toHaveLength(8);
      // Hashes must not just be the codes themselves.
      expect(savedHashes).not.toEqual(expect.arrayContaining(result.backupCodes));
    });
  });

  describe('disable', () => {
    it('throws UnauthorizedException for an incorrect password', async () => {
      const passwordHash = await hashPassword('correct-password');
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ password: passwordHash, mfaEnabled: true }));

      await expect(service.disable('user-1', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for a Google-only account with no password', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ password: null, mfaEnabled: true }));

      await expect(service.disable('user-1', 'anything')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('clears MFA fields for a correct password', async () => {
      const passwordHash = await hashPassword('correct-password');
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        buildUser({ password: passwordHash, mfaEnabled: true, mfaSecret: 'secret', mfaBackupCodeHashes: ['h1'] }),
      );

      await service.disable('user-1', 'correct-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [] },
      });
    });
  });

  describe('issueChallenge', () => {
    it('signs a challenge payload distinct from a real access token, with a short expiry', () => {
      jwtService.sign.mockReturnValue('challenge.jwt');

      const token = service.issueChallenge('user-1');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-1', purpose: 'mfa-challenge' },
        { expiresIn: '5m' },
      );
      expect(token).toBe('challenge.jwt');
    });
  });

  describe('verifyChallenge', () => {
    it('throws UnauthorizedException when the token is expired/invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verifyChallenge('bad.token', '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the token has the wrong purpose', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'password-reset' });

      await expect(service.verifyChallenge('token', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the user no longer has MFA enabled', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-challenge' });
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: false }));

      await expect(service.verifyChallenge('token', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the user for a correct TOTP code', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-challenge' });
      const user = buildUser({ mfaEnabled: true, mfaSecret: secret });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyChallenge('token', code)).resolves.toEqual(user);
    });

    it('rejects an incorrect TOTP code that also is not a valid backup code', async () => {
      const secret = generateSecret();
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-challenge' });
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: true, mfaSecret: secret }));

      await expect(service.verifyChallenge('token', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts a correct backup code and consumes it (single-use)', async () => {
      const secret = generateSecret();
      const backupCode = 'abcd1234ef';
      const backupHash = await hashPassword(backupCode);
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-challenge' });
      const user = buildUser({
        mfaEnabled: true,
        mfaSecret: secret,
        mfaBackupCodeHashes: [backupHash, 'other-hash'],
      });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyChallenge('token', backupCode)).resolves.toEqual(user);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaBackupCodeHashes: ['other-hash'] },
      });
    });
  });
});
