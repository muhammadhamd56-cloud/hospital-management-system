import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DayOfWeek, StaffType, type Staff, type StaffAvailability } from '@prisma/client';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const ACTOR_ID = 'admin-1';

function buildStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: 'staff-1',
    staffType: StaffType.NURSE,
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

function buildAvailability(overrides: Partial<StaffAvailability> = {}): StaffAvailability {
  return {
    id: 'avail-1',
    staffId: 'staff-1',
    dayOfWeek: DayOfWeek.MONDAY,
    isAvailable: true,
    availableFrom: '08:00',
    availableTo: '16:00',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let prisma: {
    staff: { findUnique: jest.Mock };
    staffAvailability: { findMany: jest.Mock; upsert: jest.Mock };
    staffLeave: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      staff: { findUnique: jest.fn() },
      staffAvailability: { findMany: jest.fn(), upsert: jest.fn() },
      staffLeave: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(AvailabilityService);
  });

  describe('findForStaff', () => {
    it('throws NotFoundException when the staff member does not exist', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.findForStaff('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('defaults days without a saved row to available with no time restriction', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffAvailability.findMany.mockResolvedValue([buildAvailability()]);

      const result = await service.findForStaff('staff-1');

      expect(result).toHaveLength(7);
      const monday = result.find((day) => day.dayOfWeek === 'monday');
      expect(monday).toEqual({ dayOfWeek: 'monday', isAvailable: true, availableFrom: '08:00', availableTo: '16:00' });
      const wednesday = result.find((day) => day.dayOfWeek === 'wednesday');
      expect(wednesday).toEqual({ dayOfWeek: 'wednesday', isAvailable: true, availableFrom: null, availableTo: null });
    });
  });

  describe('upsertForStaff', () => {
    it('upserts each day within a transaction', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffAvailability.upsert.mockResolvedValue(buildAvailability());
      prisma.staffAvailability.findMany.mockResolvedValue([]);

      await service.upsertForStaff(
        'staff-1',
        { days: [{ dayOfWeek: 'wednesday', isAvailable: false }] },
        ACTOR_ID,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.staffAvailability.upsert).toHaveBeenCalledWith({
        where: { staffId_dayOfWeek: { staffId: 'staff-1', dayOfWeek: DayOfWeek.WEDNESDAY } },
        update: { isAvailable: false, availableFrom: null, availableTo: null },
        create: { staffId: 'staff-1', dayOfWeek: DayOfWeek.WEDNESDAY, isAvailable: false, availableFrom: null, availableTo: null },
      });
    });
  });

  describe('createLeave / removeLeave', () => {
    it('throws NotFoundException creating leave for a nonexistent staff member', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.createLeave('missing', { date: '2026-08-25' }, ACTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException removing a leave record that does not belong to the staff member', async () => {
      prisma.staffLeave.findUnique.mockResolvedValue({ id: 'leave-1', staffId: 'other-staff' });

      await expect(service.removeLeave('staff-1', 'leave-1', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staffLeave.delete).not.toHaveBeenCalled();
    });
  });
});
