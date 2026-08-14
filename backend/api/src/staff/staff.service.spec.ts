import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStaffDto } from './dto/create-staff.dto';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleId: null,
    email: 'staff@example.com',
    password: 'hashed',
    firstName: 'Grace',
    lastName: 'Hopper',
    picture: null,
    role: Role.RECEPTIONIST,
    roleSelected: true,
    emailVerified: true,
    otpCodeHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLastSentAt: null,
    tokenVersion: 0,
    mustChangePassword: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('StaffService', () => {
  let service: StaffService;
  let prisma: {
    user: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    department: { upsert: jest.Mock };
    doctor: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      department: { upsert: jest.fn() },
      doctor: { create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(StaffService);
  });

  describe('findAll', () => {
    it('queries only staff roles (doctor/receptionist/lab_staff/pharmacist), newest first', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: [Role.DOCTOR, Role.RECEPTIONIST, Role.LAB_STAFF, Role.PHARMACIST] } },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('maps rows to StaffResponse', async () => {
      prisma.user.findMany.mockResolvedValue([buildUser()]);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: 'user-1',
          fullName: 'Grace Hopper',
          email: 'staff@example.com',
          role: 'receptionist',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('create', () => {
    const receptionistDto: CreateStaffDto = {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'staff@example.com',
      role: 'receptionist',
    };

    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(service.create(receptionistDto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a non-doctor staff account pre-verified with mustChangePassword and no linked Doctor row', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser();
      prisma.user.create.mockResolvedValue(created);

      const result = await service.create(receptionistDto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'staff@example.com',
          role: Role.RECEPTIONIST,
          roleSelected: true,
          emailVerified: true,
          mustChangePassword: true,
        }),
      });
      expect(prisma.doctor.create).not.toHaveBeenCalled();
      expect(result.staff.role).toBe('receptionist');
      expect(typeof result.tempPassword).toBe('string');
      expect(result.tempPassword.length).toBeGreaterThanOrEqual(12);
      // The returned password must be the plaintext temp password, not the hash persisted to the DB.
      expect(prisma.user.create).not.toHaveBeenCalledWith({
        data: expect.objectContaining({ password: result.tempPassword }),
      });
    });

    it('creates a linked Doctor row (via Department.upsert) when role is doctor', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser({ role: Role.DOCTOR });
      prisma.user.create.mockResolvedValue(created);
      prisma.department.upsert.mockResolvedValue({ id: 'dept-1', name: 'Cardiology' });

      const doctorDto: CreateStaffDto = {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'doc@example.com',
        role: 'doctor',
        specialization: 'Cardiology',
        department: 'Cardiology',
        bio: 'Heart stuff',
        experienceYears: 10,
      };

      await service.create(doctorDto);

      expect(prisma.department.upsert).toHaveBeenCalledWith({
        where: { name: 'Cardiology' },
        update: {},
        create: { name: 'Cardiology' },
      });
      expect(prisma.doctor.create).toHaveBeenCalledWith({
        data: {
          specialization: 'Cardiology',
          departmentId: 'dept-1',
          bio: 'Heart stuff',
          experienceYears: 10,
          userId: created.id,
        },
      });
    });

    it('generates a different temp password on each call', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser());

      const first = await service.create(receptionistDto);
      const second = await service.create(receptionistDto);

      expect(first.tempPassword).not.toBe(second.tempPassword);
    });
  });
});
