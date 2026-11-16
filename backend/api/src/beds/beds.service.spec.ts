import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, BedStatus, Prisma, Role, type Bed, type User } from '@prisma/client';
import { BedsService } from './beds.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const doctorCaller: AuthenticatedUser = { id: 'doctor-user-1', email: 'doc@example.com', role: Role.DOCTOR };

function buildBed(overrides: Partial<Bed> = {}): Bed {
  return {
    id: 'bed-1',
    label: 'A-101',
    status: BedStatus.AVAILABLE,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    departmentId: 'dept-1',
    patientId: null,
    ...overrides,
  };
}

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
    approvalStatus: ApprovalStatus.APPROVED,
    approvalReviewedAt: null,
    approvalNote: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildBedWithIncludes(
  bedOverrides: Partial<Bed> = {},
  patient: Pick<User, 'firstName' | 'lastName'> | null = null,
  departmentName = 'Cardiology',
) {
  return {
    ...buildBed(bedOverrides),
    patient,
    department: { name: departmentName },
  };
}

describe('BedsService', () => {
  let service: BedsService;
  let prisma: {
    bed: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    doctor: { findUnique: jest.Mock };
    appointment: { findMany: jest.Mock; findFirst: jest.Mock };
    chatMessage: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      bed: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn().mockResolvedValue({ id: 'doctor-1' }) },
      appointment: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BedsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BedsService);
  });

  describe('findAll', () => {
    it('returns an empty list with zero counts when there are no beds', async () => {
      prisma.bed.findMany.mockResolvedValue([]);

      const result = await service.findAll(admin);

      expect(result).toEqual({ beds: [], totalCount: 0, availableCount: 0 });
    });

    it('maps beds to the response shape, lowercasing status and joining patient name', async () => {
      const beds = [
        buildBedWithIncludes(
          { id: 'bed-1', label: 'A-101', status: BedStatus.OCCUPIED, patientId: 'user-1' },
          { firstName: 'Ada', lastName: 'Lovelace' },
          'Cardiology',
        ),
        buildBedWithIncludes({ id: 'bed-2', label: 'A-102', status: BedStatus.AVAILABLE }, null, 'Cardiology'),
        buildBedWithIncludes({ id: 'bed-3', label: 'B-201', status: BedStatus.MAINTENANCE }, null, 'Neurology'),
      ];
      prisma.bed.findMany.mockResolvedValue(beds);

      const result = await service.findAll(admin);

      expect(result.totalCount).toBe(3);
      expect(result.availableCount).toBe(1);
      expect(result.beds).toEqual([
        {
          id: 'bed-1',
          label: 'A-101',
          department: 'Cardiology',
          status: 'occupied',
          patientId: 'user-1',
          patientName: 'Ada Lovelace',
        },
        {
          id: 'bed-2',
          label: 'A-102',
          department: 'Cardiology',
          status: 'available',
          patientId: null,
          patientName: null,
        },
        {
          id: 'bed-3',
          label: 'B-201',
          department: 'Neurology',
          status: 'maintenance',
          patientId: null,
          patientName: null,
        },
      ]);
      expect(prisma.bed.findMany).toHaveBeenCalledWith({
        include: {
          patient: { select: { firstName: true, lastName: true } },
          department: { select: { name: true } },
        },
        orderBy: [{ department: { name: 'asc' } }, { label: 'asc' }],
      });
    });
  });

  describe('assign', () => {
    it('throws NotFoundException when the bed does not exist', async () => {
      prisma.bed.findUnique.mockResolvedValue(null);

      await expect(service.assign(admin, 'missing-bed', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is already occupied', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.OCCUPIED, patientId: 'other-user' }));

      await expect(service.assign(admin, 'bed-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is under maintenance', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.MAINTENANCE }));

      await expect(service.assign(admin, 'bed-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the patient does not exist', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.assign(admin, 'bed-1', 'missing-user')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the target user is not a patient', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: Role.DOCTOR }));

      await expect(service.assign(admin, 'bed-1', 'doc-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('assigns an available bed to a patient and returns the mapped response', async () => {
      prisma.bed.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id ? buildBed({ status: BedStatus.AVAILABLE }) : null),
      );
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-1', role: Role.PATIENT }));
      const updated = buildBedWithIncludes(
        { id: 'bed-1', status: BedStatus.OCCUPIED, patientId: 'user-1' },
        { firstName: 'Ada', lastName: 'Lovelace' },
      );
      prisma.bed.update.mockResolvedValue(updated);

      const result = await service.assign(admin, 'bed-1', 'user-1');

      expect(prisma.bed.update).toHaveBeenCalledWith({
        // Conditional on still being available (concurrent assigns).
        where: { id: 'bed-1', status: BedStatus.AVAILABLE },
        data: { status: BedStatus.OCCUPIED, patientId: 'user-1' },
        include: {
          patient: { select: { firstName: true, lastName: true } },
          department: { select: { name: true } },
        },
      });
      expect(result).toEqual({
        id: 'bed-1',
        label: 'A-101',
        department: 'Cardiology',
        status: 'occupied',
        patientId: 'user-1',
        patientName: 'Ada Lovelace',
      });
    });

    it('throws ConflictException when the patient already occupies another bed', async () => {
      prisma.bed.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id ? buildBed({ status: BedStatus.AVAILABLE }) : buildBed({ id: 'bed-2', patientId: 'user-1' })),
      );
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-1', role: Role.PATIENT }));

      await expect(service.assign(admin, 'bed-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('converts a unique constraint race (P2002) into a ConflictException', async () => {
      prisma.bed.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id ? buildBed({ status: BedStatus.AVAILABLE }) : null),
      );
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-1', role: Role.PATIENT }));
      prisma.bed.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.0.0' }),
      );

      await expect(service.assign(admin, 'bed-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('release', () => {
    it('throws NotFoundException when the bed does not exist', async () => {
      prisma.bed.findUnique.mockResolvedValue(null);

      await expect(service.release(admin, 'missing-bed')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is not occupied (already available)', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));

      await expect(service.release(admin, 'bed-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is under maintenance', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.MAINTENANCE }));

      await expect(service.release(admin, 'bed-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('releases an occupied bed, clearing the patient, and returns the mapped response', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.OCCUPIED, patientId: 'user-1' }));
      const updated = buildBedWithIncludes({ id: 'bed-1', status: BedStatus.AVAILABLE, patientId: null }, null);
      prisma.bed.update.mockResolvedValue(updated);

      const result = await service.release(admin, 'bed-1');

      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-1' },
        data: { status: BedStatus.AVAILABLE, patientId: null },
        include: {
          patient: { select: { firstName: true, lastName: true } },
          department: { select: { name: true } },
        },
      });
      expect(result).toEqual({
        id: 'bed-1',
        label: 'A-101',
        department: 'Cardiology',
        status: 'available',
        patientId: null,
        patientName: null,
      });
    });
  });

  describe('doctor callers (doctor accounts can be self-registered)', () => {
    it("shows a doctor the ward's occupancy but only their own patients' names", async () => {
      prisma.bed.findMany.mockResolvedValue([
        buildBedWithIncludes({ id: 'bed-1', status: BedStatus.OCCUPIED, patientId: 'own-patient' }, { firstName: 'Own', lastName: 'Patient' }),
        buildBedWithIncludes({ id: 'bed-2', status: BedStatus.OCCUPIED, patientId: 'someone-else' }, { firstName: 'Other', lastName: 'Patient' }),
      ]);
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'own-patient' }]);

      const result = await service.findAll(doctorCaller);

      expect(result.beds[0]).toMatchObject({ status: 'occupied', patientId: 'own-patient', patientName: 'Own Patient' });
      expect(result.beds[1]).toMatchObject({ status: 'occupied', patientId: null, patientName: null });
    });

    it('refuses to let a doctor assign a bed to a patient they have no relationship with', async () => {
      prisma.bed.findUnique.mockResolvedValueOnce(buildBed());
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'stranger' }));

      await expect(service.assign(doctorCaller, 'bed-1', 'stranger')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it("refuses to let a doctor release a bed held by someone else's patient", async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.OCCUPIED, patientId: 'stranger' }));

      await expect(service.release(doctorCaller, 'bed-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('lets a doctor release a bed held by their own patient', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.OCCUPIED, patientId: 'own-patient' }));
      prisma.appointment.findFirst.mockResolvedValue({ id: 'appt-1' });
      prisma.bed.update.mockResolvedValue(buildBedWithIncludes({ status: BedStatus.AVAILABLE }, null));

      await expect(service.release(doctorCaller, 'bed-1')).resolves.toMatchObject({ status: 'available' });
    });
  });
});
