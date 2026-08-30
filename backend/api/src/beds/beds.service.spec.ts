import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BedStatus, Role, type Bed, type User } from '@prisma/client';
import { BedsService } from './beds.service';
import { PrismaService } from '../prisma/prisma.service';

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
  };

  beforeEach(async () => {
    prisma = {
      bed: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BedsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BedsService);
  });

  describe('findAll', () => {
    it('returns an empty list with zero counts when there are no beds', async () => {
      prisma.bed.findMany.mockResolvedValue([]);

      const result = await service.findAll();

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

      const result = await service.findAll();

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

      await expect(service.assign('missing-bed', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is already occupied', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.OCCUPIED, patientId: 'other-user' }));

      await expect(service.assign('bed-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is under maintenance', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.MAINTENANCE }));

      await expect(service.assign('bed-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the patient does not exist', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.assign('bed-1', 'missing-user')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the target user is not a patient', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: Role.DOCTOR }));

      await expect(service.assign('bed-1', 'doc-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('assigns an available bed to a patient and returns the mapped response', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-1', role: Role.PATIENT }));
      const updated = buildBedWithIncludes(
        { id: 'bed-1', status: BedStatus.OCCUPIED, patientId: 'user-1' },
        { firstName: 'Ada', lastName: 'Lovelace' },
      );
      prisma.bed.update.mockResolvedValue(updated);

      const result = await service.assign('bed-1', 'user-1');

      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-1' },
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
  });

  describe('release', () => {
    it('throws NotFoundException when the bed does not exist', async () => {
      prisma.bed.findUnique.mockResolvedValue(null);

      await expect(service.release('missing-bed')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is not occupied (already available)', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.AVAILABLE }));

      await expect(service.release('bed-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the bed is under maintenance', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.MAINTENANCE }));

      await expect(service.release('bed-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('releases an occupied bed, clearing the patient, and returns the mapped response', async () => {
      prisma.bed.findUnique.mockResolvedValue(buildBed({ status: BedStatus.OCCUPIED, patientId: 'user-1' }));
      const updated = buildBedWithIncludes({ id: 'bed-1', status: BedStatus.AVAILABLE, patientId: null }, null);
      prisma.bed.update.mockResolvedValue(updated);

      const result = await service.release('bed-1');

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
});
