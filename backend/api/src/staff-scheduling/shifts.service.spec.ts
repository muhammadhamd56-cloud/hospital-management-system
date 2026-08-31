import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShiftStatus, ShiftType, StaffType, type Staff, type StaffShift } from '@prisma/client';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

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

function buildShift(overrides: Partial<StaffShift> = {}): StaffShift {
  return {
    id: 'shift-1',
    staffId: 'staff-1',
    departmentId: null,
    date: new Date('2026-08-20T00:00:00.000Z'),
    startTime: new Date('2026-08-20T08:00:00.000Z'),
    endTime: new Date('2026-08-20T16:00:00.000Z'),
    shiftType: ShiftType.MORNING,
    status: ShiftStatus.SCHEDULED,
    notes: null,
    groupId: null,
    createdById: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// 2026-08-20 is a Thursday; matches the "unavailable on Thursday" tests below.
const MORNING_SHIFT_INPUT = {
  staffId: 'staff-1',
  startTime: '2026-08-20T08:00:00.000Z',
  endTime: '2026-08-20T16:00:00.000Z',
  date: '2026-08-20',
  localStartTime: '08:00',
  shiftType: 'morning' as const,
};

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: {
    staffShift: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    staff: { findUnique: jest.Mock };
    staffLeave: { findUnique: jest.Mock };
    staffAvailability: { findUnique: jest.Mock };
    department: { upsert: jest.Mock };
  };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      staffShift: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      staff: { findUnique: jest.fn() },
      staffLeave: { findUnique: jest.fn().mockResolvedValue(null) },
      staffAvailability: { findUnique: jest.fn().mockResolvedValue(null) },
      department: { upsert: jest.fn() },
    };
    notifications = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ShiftsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the staff member does not exist', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...MORNING_SHIFT_INPUT, staffId: 'missing' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when endTime is not after startTime', async () => {
      await expect(
        service.create(
          { ...MORNING_SHIFT_INPUT, startTime: '2026-08-20T16:00:00.000Z', endTime: '2026-08-20T08:00:00.000Z' },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.staff.findUnique).not.toHaveBeenCalled();
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the staff member is inactive', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff({ isActive: false }));

      await expect(service.create(MORNING_SHIFT_INPUT, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it('upserts the department by name and links its id', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.department.upsert.mockResolvedValue({ id: 'dept-1', name: 'Emergency', description: null, createdAt: new Date() });
      prisma.staffShift.findFirst.mockResolvedValue(null);
      prisma.staffShift.create.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null, department: null } });

      await service.create({ ...MORNING_SHIFT_INPUT, department: 'Emergency' }, 'admin-1');

      expect(prisma.department.upsert).toHaveBeenCalledWith({
        where: { name: 'Emergency' },
        update: {},
        create: { name: 'Emergency' },
      });
      expect(prisma.staffShift.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ departmentId: 'dept-1' }) }),
      );
    });

    // The exact scenario from the spec: existing 08:00-16:00, attempted 14:00-22:00 -> rejected.
    it('rejects an overlapping shift with a ConflictException', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockResolvedValue(buildShift());

      await expect(
        service.create(
          {
            ...MORNING_SHIFT_INPUT,
            startTime: '2026-08-20T14:00:00.000Z',
            endTime: '2026-08-20T22:00:00.000Z',
            localStartTime: '14:00',
            shiftType: 'evening',
          },
          'admin-1',
        ),
      ).rejects.toThrow("You're already assigned to a shift during this time.");
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it('excludes cancelled shifts from the overlap check', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockImplementation(({ where }) => {
        expect(where.status).toEqual({ not: ShiftStatus.CANCELLED });
        return Promise.resolve(null);
      });
      prisma.staffShift.create.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null } });

      await service.create(MORNING_SHIFT_INPUT, 'admin-1');

      expect(prisma.staffShift.create).toHaveBeenCalled();
    });

    it('creates a non-overlapping shift and returns the mapped response', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockResolvedValue(null);
      prisma.staffShift.create.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null } });

      const result = await service.create(MORNING_SHIFT_INPUT, 'admin-1');

      expect(prisma.staffShift.create).toHaveBeenCalledWith({
        data: {
          staffId: 'staff-1',
          departmentId: undefined,
          date: new Date('2026-08-20T00:00:00.000Z'),
          startTime: new Date('2026-08-20T08:00:00.000Z'),
          endTime: new Date('2026-08-20T16:00:00.000Z'),
          shiftType: ShiftType.MORNING,
          notes: undefined,
          groupId: undefined,
          createdById: 'admin-1',
        },
        include: { staff: { include: { user: true, department: true } }, department: true },
      });
      expect(result.status).toBe('scheduled');
    });

    it('skips notifying when the staff member has no linked user account', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockResolvedValue(null);
      prisma.staffShift.create.mockResolvedValue({
        ...buildShift(),
        staff: { ...buildStaff(), user: null, department: null },
      });

      await service.create(MORNING_SHIFT_INPUT, 'admin-1');

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('notifies the linked user when the staff member has a login account', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff({ userId: 'user-1' }));
      prisma.staffShift.findFirst.mockResolvedValue(null);
      prisma.staffShift.create.mockResolvedValue({
        ...buildShift(),
        staff: { ...buildStaff({ userId: 'user-1' }), user: null, department: null },
      });

      await service.create(MORNING_SHIFT_INPUT, 'admin-1');

      expect(notifications.create).toHaveBeenCalledWith('user-1', 'SHIFT_SCHEDULED', expect.any(String), expect.any(String), '/my-shifts?shiftId=shift-1');
    });

    it('rejects a shift on a date the staff member has leave', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffLeave.findUnique.mockResolvedValue({
        id: 'leave-1',
        staffId: 'staff-1',
        date: new Date('2026-08-20T00:00:00.000Z'),
        reason: 'Annual leave',
        createdAt: new Date(),
      });

      await expect(service.create(MORNING_SHIFT_INPUT, 'admin-1')).rejects.toThrow(
        'Staff member is on leave on this date',
      );
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it('rejects a shift on a day the staff member is marked unavailable', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffAvailability.findUnique.mockResolvedValue({
        id: 'avail-1',
        staffId: 'staff-1',
        dayOfWeek: 'THURSDAY',
        isAvailable: false,
        availableFrom: null,
        availableTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2026-08-20 is a Thursday.
      await expect(service.create(MORNING_SHIFT_INPUT, 'admin-1')).rejects.toThrow(
        'Staff member is unavailable on this day',
      );
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it("rejects a shift starting outside the staff member's available hours", async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffAvailability.findUnique.mockResolvedValue({
        id: 'avail-1',
        staffId: 'staff-1',
        dayOfWeek: 'THURSDAY',
        isAvailable: true,
        availableFrom: '09:00',
        availableTo: '17:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.create(MORNING_SHIFT_INPUT, 'admin-1')).rejects.toThrow(
        "Shift start time falls outside the staff member's available hours",
      );
      expect(prisma.staffShift.create).not.toHaveBeenCalled();
    });

    it('compares availability hours against the local start time, not the UTC hour', async () => {
      // Local start is 08:00 (within 06:00-20:00 local availability), but the UTC
      // instant for a positive-offset timezone would be several hours earlier --
      // this must NOT be rejected just because the UTC hour looks out of range.
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffAvailability.findUnique.mockResolvedValue({
        id: 'avail-1',
        staffId: 'staff-1',
        dayOfWeek: 'THURSDAY',
        isAvailable: true,
        availableFrom: '06:00',
        availableTo: '20:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.staffShift.findFirst.mockResolvedValue(null);
      prisma.staffShift.create.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null, department: null } });

      // startTime here is UTC 03:00 (would be outside 06:00-20:00 if compared as
      // a UTC hour), but localStartTime correctly says 08:00.
      await service.create(
        { ...MORNING_SHIFT_INPUT, startTime: '2026-08-20T03:00:00.000Z', localStartTime: '08:00' },
        'admin-1',
      );

      expect(prisma.staffShift.create).toHaveBeenCalled();
    });

    it('uses the explicit local date for the leave/day-of-week lookup, not a UTC-truncated one', async () => {
      // startTime's UTC instant falls on the PREVIOUS UTC calendar day (2026-08-19,
      // a Wednesday), but the admin's local date is 2026-08-20 (a Thursday) --
      // the leave/availability lookups must use the explicit local date.
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockResolvedValue(null);
      prisma.staffShift.create.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null, department: null } });

      await service.create(
        { ...MORNING_SHIFT_INPUT, startTime: '2026-08-19T21:00:00.000Z', localStartTime: '02:00' },
        'admin-1',
      );

      expect(prisma.staffLeave.findUnique).toHaveBeenCalledWith({
        where: { staffId_date: { staffId: 'staff-1', date: new Date('2026-08-20T00:00:00.000Z') } },
      });
      expect(prisma.staffAvailability.findUnique).toHaveBeenCalledWith({
        where: { staffId_dayOfWeek: { staffId: 'staff-1', dayOfWeek: 'THURSDAY' } },
      });
    });
  });

  describe('createRecurring', () => {
    const threeMondays = [
      { startTime: '2026-08-17T08:00:00.000Z', endTime: '2026-08-17T16:00:00.000Z', date: '2026-08-17', localStartTime: '08:00' },
      { startTime: '2026-08-24T08:00:00.000Z', endTime: '2026-08-24T16:00:00.000Z', date: '2026-08-24', localStartTime: '08:00' },
      { startTime: '2026-08-31T08:00:00.000Z', endTime: '2026-08-31T16:00:00.000Z', date: '2026-08-31', localStartTime: '08:00' },
    ];

    it('creates one shift per occurrence, sharing a groupId', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockResolvedValue(null);
      let callCount = 0;
      prisma.staffShift.create.mockImplementation(({ data }) => {
        callCount += 1;
        return Promise.resolve({
          ...buildShift({ id: `shift-${callCount}`, startTime: data.startTime, endTime: data.endTime, groupId: data.groupId }),
          staff: { ...buildStaff(), user: null, department: null },
        });
      });

      const result = await service.createRecurring(
        { staffId: 'staff-1', shiftType: 'morning', occurrences: threeMondays },
        'admin-1',
      );

      expect(result).toHaveLength(3);
      expect(prisma.staffShift.create).toHaveBeenCalledTimes(3);
      const groupIds = new Set(result.map((shift) => shift.groupId));
      expect(groupIds.size).toBe(1);
    });

    it('rolls back every shift already created when a later occurrence conflicts', async () => {
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      let callCount = 0;
      prisma.staffShift.findFirst.mockImplementation(() => {
        callCount += 1;
        // First occurrence is clear, second occurrence conflicts.
        return Promise.resolve(callCount === 2 ? buildShift() : null);
      });
      prisma.staffShift.create.mockImplementation(({ data }) =>
        Promise.resolve({
          ...buildShift({ id: 'shift-created-1', startTime: data.startTime, endTime: data.endTime, groupId: data.groupId }),
          staff: { ...buildStaff(), user: null, department: null },
        }),
      );

      await expect(
        service.createRecurring(
          { staffId: 'staff-1', shiftType: 'morning', occurrences: threeMondays },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.staffShift.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['shift-created-1'] } } });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the shift does not exist', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', {}, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staffShift.update).not.toHaveBeenCalled();
    });

    it('re-validates conflicts and excludes its own row from the overlap query', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockImplementation(({ where }) => {
        expect(where.id).toEqual({ not: 'shift-1' });
        return Promise.resolve(null);
      });
      prisma.staffShift.update.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null } });

      await service.update('shift-1', { startTime: '2026-08-20T09:00:00.000Z', localStartTime: '09:00' }, 'admin-1');

      expect(prisma.staffShift.findFirst).toHaveBeenCalled();
      expect(prisma.staffShift.update).toHaveBeenCalled();
    });

    it('skips conflict re-validation for a notes-only edit', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.staffShift.update.mockResolvedValue({ ...buildShift(), staff: { ...buildStaff(), user: null } });

      await service.update('shift-1', { notes: 'Covering for Ali' }, 'admin-1');

      expect(prisma.staff.findUnique).not.toHaveBeenCalled();
      expect(prisma.staffShift.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an update that overlaps another shift', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.staff.findUnique.mockResolvedValue(buildStaff());
      prisma.staffShift.findFirst.mockResolvedValue(buildShift({ id: 'shift-2' }));

      await expect(
        service.update('shift-1', { startTime: '2026-08-20T09:00:00.000Z', localStartTime: '09:00' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.staffShift.update).not.toHaveBeenCalled();
    });

    it('sends a cancellation notification when status transitions to cancelled', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.staffShift.update.mockResolvedValue({
        ...buildShift({ status: ShiftStatus.CANCELLED }),
        staff: { ...buildStaff({ userId: 'user-1' }), user: null, department: null },
      });

      await service.update('shift-1', { status: 'cancelled' }, 'admin-1');

      expect(notifications.create).toHaveBeenCalledWith('user-1', 'SHIFT_CANCELLED', expect.any(String), expect.any(String), '/my-shifts?shiftId=shift-1');
    });

    it('sends a generic update notification for a non-cancelling change', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.staffShift.update.mockResolvedValue({
        ...buildShift({ notes: 'Covering for Ali' }),
        staff: { ...buildStaff({ userId: 'user-1' }), user: null, department: null },
      });

      await service.update('shift-1', { notes: 'Covering for Ali' }, 'admin-1');

      expect(notifications.create).toHaveBeenCalledWith('user-1', 'SHIFT_UPDATED', expect.any(String), expect.any(String), '/my-shifts?shiftId=shift-1');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the shift does not exist', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staffShift.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the shift is not Scheduled', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift({ status: ShiftStatus.COMPLETED }));

      await expect(service.remove('shift-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.staffShift.delete).not.toHaveBeenCalled();
    });

    it('deletes a Scheduled shift', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());

      await service.remove('shift-1', 'admin-1');

      expect(prisma.staffShift.delete).toHaveBeenCalledWith({ where: { id: 'shift-1' } });
    });
  });
});
