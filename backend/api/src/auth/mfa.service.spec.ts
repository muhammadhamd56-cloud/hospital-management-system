import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { generate, generateSecret } from 'otplib';
import { ApprovalStatus, Role, type User } from '@prisma/client';
import { MfaService } from './mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './password.util';
import { AUTH_AUDIT_EVENTS, AuthAuditService } from './auth-audit.service';
import { decryptMfaSecret, encryptMfaSecret, MFA_SECRET_PREFIX } from './mfa-secret-crypto';

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

describe('MfaService', () => {
  let service: MfaService;
  let prisma: {
    user: { update: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let authAudit: { record: jest.Mock };

  /** Builds the service with an optional MFA_ENCRYPTION_KEY (raw config string). */
  async function buildService(encryptionKey?: string): Promise<MfaService> {
    const configService = { get: jest.fn((path: string) => (path === 'mfa.encryptionKey' ? encryptionKey : undefined)) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: AuthAuditService, useValue: authAudit },
      ],
    }).compile();

    return module.get(MfaService);
  }

  beforeEach(async () => {
    prisma = {
      user: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    authAudit = { record: jest.fn().mockResolvedValue(undefined) };

    // No key: the development/test plain-text mode every test below assumes
    // unless it builds its own service with a key.
    service = await buildService();
  });

  describe('startSetup', () => {
    it('generates and saves a new secret, returning it with a scannable QR code', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaEnabled: false }));
      const result = await service.startSetup('user-1', 'ada@example.com');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaSecret: result.secret },
      });
      expect(result.secret).toEqual(expect.any(String));
      expect(result.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('refuses to overwrite the secret while MFA is already enabled', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaEnabled: true }));

      await expect(service.startSetup('user-1', 'ada@example.com')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
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
    it('signs a challenge distinct from an access token, with a short expiry and a stored single-use id', async () => {
      jwtService.sign.mockReturnValue('challenge.jwt');

      const token = await service.issueChallenge('user-1');

      const [[storeArgs]] = prisma.user.update.mock.calls as [[{ data: { mfaChallengeId: string } }]];
      const jti = storeArgs.data.mfaChallengeId;
      expect(jti).toMatch(/^[0-9a-f]{32}$/);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { mfaChallengeId: jti } });
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-1', purpose: 'mfa-challenge', jti },
        { expiresIn: '5m' },
      );
      expect(token).toBe('challenge.jwt');
    });
  });

  describe('verifyChallenge', () => {
    const JTI = 'challenge-id-1';
    const challenge = { sub: 'user-1', purpose: 'mfa-challenge', jti: JTI };

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
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'password-reset', jti: JTI });

      await expect(service.verifyChallenge('token', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the user no longer has MFA enabled', async () => {
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: false, mfaChallengeId: JTI }));

      await expect(service.verifyChallenge('token', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the user for a correct TOTP code and consumes the challenge', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      const user = buildUser({ mfaEnabled: true, mfaSecret: secret, mfaChallengeId: JTI, mfaFailedAttempts: 2 });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyChallenge('token', code)).resolves.toEqual(user);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', mfaChallengeId: JTI },
        data: { mfaChallengeId: null, mfaFailedAttempts: 0, mfaLockedUntil: null },
      });
    });

    it('rejects a challenge that was already used or superseded by a newer login, even with a correct code', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: true, mfaSecret: secret, mfaChallengeId: null }));

      await expect(service.verifyChallenge('token', code)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('lets only one of two concurrent uses of the same challenge through', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: true, mfaSecret: secret, mfaChallengeId: JTI }));
      prisma.user.updateMany.mockResolvedValue({ count: 0 }); // the other request consumed it first

      await expect(service.verifyChallenge('token', code)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect code and counts it against the account', async () => {
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ mfaEnabled: true, mfaSecret: generateSecret(), mfaChallengeId: JTI, mfaFailedAttempts: 1 }),
      );

      await expect(service.verifyChallenge('token', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaFailedAttempts: 2, mfaLockedUntil: undefined },
      });
    });

    it('locks the code step and kills the challenge on the 5th wrong code', async () => {
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ mfaEnabled: true, mfaSecret: generateSecret(), mfaChallengeId: JTI, mfaFailedAttempts: 4 }),
      );

      await expect(service.verifyChallenge('token', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaFailedAttempts: 0, mfaLockedUntil: expect.any(Date), mfaChallengeId: null },
      });
    });

    it('refuses any code (even a correct one) while the code step is locked, with 429', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          mfaEnabled: true,
          mfaSecret: secret,
          mfaChallengeId: JTI,
          mfaLockedUntil: new Date(Date.now() + 10 * 60_000),
        }),
      );

      await expect(service.verifyChallenge('token', code)).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('accepts a correct backup code and consumes it (single-use)', async () => {
      const secret = generateSecret();
      const backupCode = 'abcd1234ef';
      const backupHash = await hashPassword(backupCode);
      jwtService.verify.mockReturnValue(challenge);
      const user = buildUser({
        mfaEnabled: true,
        mfaSecret: secret,
        mfaBackupCodeHashes: [backupHash, 'other-hash'],
        mfaChallengeId: JTI,
      });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyChallenge('token', backupCode)).resolves.toEqual(user);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', mfaChallengeId: JTI },
        data: { mfaChallengeId: null, mfaFailedAttempts: 0, mfaLockedUntil: null, mfaBackupCodeHashes: ['other-hash'] },
      });
    });
  });

  describe('audit events', () => {
    it('records MFA enabled after a successful confirmSetup, with no secret or code in metadata', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: secret }));

      await service.confirmSetup('user-1', code);

      expect(authAudit.record).toHaveBeenCalledWith(AUTH_AUDIT_EVENTS.MFA_ENABLED, { actorId: 'user-1', userId: 'user-1' });
      expect(JSON.stringify(authAudit.record.mock.calls)).not.toContain(secret);
      expect(JSON.stringify(authAudit.record.mock.calls)).not.toContain(code);
    });

    it('does not record MFA enabled for an incorrect setup code', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: generateSecret() }));

      await expect(service.confirmSetup('user-1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authAudit.record).not.toHaveBeenCalled();
    });

    it('records MFA disabled only after the password is verified', async () => {
      const passwordHash = await hashPassword('correct-password');
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ password: passwordHash, mfaEnabled: true }));

      await expect(service.disable('user-1', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authAudit.record).not.toHaveBeenCalled();

      await service.disable('user-1', 'correct-password');
      expect(authAudit.record).toHaveBeenCalledWith(AUTH_AUDIT_EVENTS.MFA_DISABLED, { actorId: 'user-1', userId: 'user-1' });
      expect(JSON.stringify(authAudit.record.mock.calls)).not.toContain('correct-password');
    });

    it('records a failed MFA challenge without an actor and without the code', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-challenge', jti: 'j1' });
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ mfaEnabled: true, mfaSecret: generateSecret(), mfaChallengeId: 'j1', mfaFailedAttempts: 4 }),
      );

      await expect(service.verifyChallenge('token', '000000')).rejects.toBeInstanceOf(UnauthorizedException);

      expect(authAudit.record).toHaveBeenCalledWith(AUTH_AUDIT_EVENTS.MFA_CHALLENGE_FAILED, {
        actorId: null,
        userId: 'user-1',
        metadata: { reason: 'invalid_code', locked: true },
      });
      expect(JSON.stringify(authAudit.record.mock.calls)).not.toContain('000000');
    });

    it('records a passed MFA challenge with the factor used', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-challenge', jti: 'j1' });
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: true, mfaSecret: secret, mfaChallengeId: 'j1' }));

      await service.verifyChallenge('token', code);

      expect(authAudit.record).toHaveBeenCalledWith(AUTH_AUDIT_EVENTS.MFA_CHALLENGE_SUCCEEDED, {
        actorId: 'user-1',
        userId: 'user-1',
        metadata: { method: 'mfa', factor: 'totp' },
      });
    });
  });

  describe('with MFA_ENCRYPTION_KEY configured', () => {
    const key = randomBytes(32);
    const challenge = { sub: 'user-1', purpose: 'mfa-challenge', jti: 'j1' };

    beforeEach(async () => {
      service = await buildService(key.toString('base64'));
    });

    it('accepts the key as 64 hex characters too', async () => {
      await expect(buildService(key.toString('hex'))).resolves.toBeInstanceOf(MfaService);
    });

    it('refuses to start with a malformed key', async () => {
      await expect(buildService('too-short')).rejects.toThrow(/32 bytes/);
    });

    it('stores the new secret encrypted, but returns the plain secret for the QR step', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaEnabled: false }));

      const result = await service.startSetup('user-1', 'ada@example.com');

      const stored: string = prisma.user.update.mock.calls[0][0].data.mfaSecret;
      expect(stored.startsWith(MFA_SECRET_PREFIX)).toBe(true);
      expect(stored).not.toContain(result.secret);
      expect(decryptMfaSecret(stored, key, 'user-1')).toBe(result.secret);
    });

    it('confirms setup against an encrypted secret without rewriting it', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: encryptMfaSecret(secret, key, 'user-1') }));

      await expect(service.confirmSetup('user-1', code)).resolves.toEqual({ backupCodes: expect.any(Array) });
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('mfaSecret');
    });

    it('re-encrypts a legacy plain-text secret when it confirms setup', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: secret }));

      await service.confirmSetup('user-1', code);

      const stored: string = prisma.user.update.mock.calls[0][0].data.mfaSecret;
      expect(stored.startsWith(MFA_SECRET_PREFIX)).toBe(true);
      expect(decryptMfaSecret(stored, key, 'user-1')).toBe(secret);
    });

    it('verifies a TOTP code against an encrypted secret and leaves the secret alone', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      const user = buildUser({ mfaEnabled: true, mfaSecret: encryptMfaSecret(secret, key, 'user-1'), mfaChallengeId: 'j1' });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.verifyChallenge('token', code)).resolves.toEqual(user);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', mfaChallengeId: 'j1' },
        data: { mfaChallengeId: null, mfaFailedAttempts: 0, mfaLockedUntil: null },
      });
    });

    it('lazily re-encrypts a legacy secret in the same write that consumes the challenge', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: true, mfaSecret: secret, mfaChallengeId: 'j1' }));

      await service.verifyChallenge('token', code);

      const data = prisma.user.updateMany.mock.calls[0][0].data;
      expect(data.mfaSecret.startsWith(MFA_SECRET_PREFIX)).toBe(true);
      expect(decryptMfaSecret(data.mfaSecret, key, 'user-1')).toBe(secret);
    });

    it('does not re-encrypt a legacy secret after a wrong code', async () => {
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(buildUser({ mfaEnabled: true, mfaSecret: generateSecret(), mfaChallengeId: 'j1' }));

      await expect(service.verifyChallenge('token', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('mfaSecret');
    });

    it('fails closed with a 500, logging neither secret nor key, when the secret was encrypted with another key', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const secret = generateSecret();
      const code = await generate({ secret });
      jwtService.verify.mockReturnValue(challenge);
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ mfaEnabled: true, mfaSecret: encryptMfaSecret(secret, randomBytes(32), 'user-1'), mfaChallengeId: 'j1' }),
      );

      try {
        await expect(service.verifyChallenge('token', code)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(prisma.user.updateMany).not.toHaveBeenCalled();
        const logged = JSON.stringify(errorSpy.mock.calls);
        expect(logged).not.toContain(secret);
        expect(logged).not.toContain(key.toString('base64'));
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe('without MFA_ENCRYPTION_KEY', () => {
    it('cannot read an encrypted secret and fails closed', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const secret = generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ mfaSecret: encryptMfaSecret(secret, randomBytes(32), 'user-1') }));

      try {
        await expect(service.confirmSetup('user-1', await generate({ secret }))).rejects.toBeInstanceOf(
          InternalServerErrorException,
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('refuses to start in production', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(buildService()).rejects.toThrow(/MFA_ENCRYPTION_KEY is required/);
      } finally {
        process.env.NODE_ENV = original;
      }
    });
  });
});
