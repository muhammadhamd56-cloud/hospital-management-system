import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, StaffType, type Staff, type User } from '@prisma/client';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const ACTOR_ID = 'admin-1';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleId: null,
    email: 'ahmed@example.com',
    password: null,
    firstName: 'Ahmed',
    lastName: 'Khan',
    phone: null,
    picture: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContact: null,
    role: Role.DOCTOR,
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

function buildStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: 'staff-1',
    staffType: StaffType.RECEPTIONIST,
    fullName: 'Sara Ahmed',
    email: null,
    isActive: true,
    userId: null,
    departmentId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('StaffService', () => {
  let service: StaffService;
  let prisma: {
    staff: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    user: { findUnique: jest.Mock };
    department: { upsert: jest.Mock };
  };
  let auditLog: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      staff: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      user: { findUnique: jest.fn() },
      department: { upsert: jest.fn() },
    };
    auditLog = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get(StaffService);
  });

  describe('create — name-only staff types', () => {
    it('creates a receptionist roster entry without a userId', async () => {
      prisma.staff.create.mockResolvedValue(buildStaff());

      const result = await service.create({ staffType: 'receptionist', fullName: 'Sara Ahmed' }, ACTOR_ID);

      expect(prisma.department.upsert).not.toHaveBeenCalled();
      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: { staffType: StaffType.RECEPTIONIST, fullName: 'Sara Ahmed', email: undefined, departmentId: undefined },
        include: { user: true, department: true },
      });
      expect(result.staffType).toBe('receptionist');
      expect(result.userId).toBeNull();
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_ID, action: 'CREATE', entityType: 'Staff' }));
    });

    it('upserts the department by name (departments are name-keyed across the app) and links its id', async () => {
      prisma.department.upsert.mockResolvedValue({ id: 'dept-1', name: 'Emergency', description: null, createdAt: new Date() });
      prisma.staff.create.mockResolvedValue(buildStaff({ departmentId: 'dept-1' }));

      await service.create({ staffType: 'receptionist', fullName: 'Sara Ahmed', department: 'Emergency' }, ACTOR_ID);

      expect(prisma.department.upsert).toHaveBeenCalledWith({
        where: { name: 'Emergency' },
        update: {},
        create: { name: 'Emergency' },
      });
      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: { staffType: StaffType.RECEPTIONIST, fullName: 'Sara Ahmed', email: undefined, departmentId: 'dept-1' },
        include: { user: true, department: true },
      });
    });
  });

  describe('create — user-linked staff types', () => {
    it('rejects when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create({ staffType: 'doctor', userId: 'missing' }, ACTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });

    it('rejects when the user role does not match the staff type', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: Role.PATIENT }));

      await expect(service.create({ staffType: 'doctor', userId: 'user-1' }, ACTOR_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });

    it('rejects when the user is already linked to a staff roster entry', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: Role.DOCTOR }));
      prisma.staff.findUnique.mockResolvedValue(buildStaff({ userId: 'user-1' }));

      await expect(service.create({ staffType: 'doctor', userId: 'user-1' }, ACTOR_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });

    it('links to the existing user without accepting a fullName/email from the request', async () => {
      const user = buildUser({ role: Role.DOCTOR });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.staff.findUnique.mockResolvedValue(null);
      prisma.staff.create.mockResolvedValue(buildStaff({ staffType: StaffType.DOCTOR, userId: user.id, user } as any));

      const result = await service.create({ staffType: 'doctor', userId: 'user-1' }, ACTOR_ID);

      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: {
          staffType: StaffType.DOCTOR,
          fullName: 'Ahmed Khan',
          email: 'ahmed@example.com',
          userId: 'user-1',
          departmentId: undefined,
        },
        include: { user: true, department: true },
      });
      expect(result.staffType).toBe('doctor');
    });

    it('rejects linking a nurse-type roster entry to a user without the STAFF role', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: Role.PATIENT }));

      await expect(service.create({ staffType: 'nurse', userId: 'user-1' }, ACTOR_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });

    it('links a nurse roster entry to an existing STAFF-role user account', async () => {
      const user = buildUser({ role: Role.STAFF, firstName: 'Florence', lastName: 'Nightingale', email: 'florence@example.com' });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.staff.findUnique.mockResolvedValue(null);
      prisma.staff.create.mockResolvedValue(
        buildStaff({ staffType: StaffType.NURSE, userId: user.id, fullName: 'Florence Nightingale', email: user.email, user } as any),
      );

      const result = await service.create({ staffType: 'nurse', userId: 'user-1' }, ACTOR_ID);

      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: {
          staffType: StaffType.NURSE,
          fullName: 'Florence Nightingale',
          email: 'florence@example.com',
          userId: 'user-1',
          departmentId: undefined,
        },
        include: { user: true, department: true },
      });
      expect(result.staffType).toBe('nurse');
    });

    it('also allows linking a receptionist-type roster entry to an existing STAFF-role account (not just doctor/nurse)', async () => {
      const user = buildUser({ role: Role.STAFF, firstName: 'Bilal', lastName: 'Iqbal', email: 'bilal@example.com' });
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.staff.findUnique.mockResolvedValue(null);
      prisma.staff.create.mockResolvedValue(
        buildStaff({ staffType: StaffType.RECEPTIONIST, userId: user.id, fullName: 'Bilal Iqbal', email: user.email, user } as any),
      );

      const result = await service.create({ staffType: 'receptionist', userId: 'user-1' }, ACTOR_ID);

      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: {
          staffType: StaffType.RECEPTIONIST,
          fullName: 'Bilal Iqbal',
          email: 'bilal@example.com',
          userId: 'user-1',
          departmentId: undefined,
        },
        include: { user: true, department: true },
      });
      expect(result.staffType).toBe('receptionist');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the staff member does not exist', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', {}, ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });

    it('rejects editing fullName/email on a user-linked staff entry', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff({ userId: 'user-1' }));

      await expect(service.update('staff-1', { fullName: 'New Name' }, ACTOR_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the staff member does not exist', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staff.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing staff member', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());

      await service.remove('staff-1', ACTOR_ID);

      expect(prisma.staff.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_ID, action: 'DELETE', entityType: 'Staff' }));
    });
  });
});
