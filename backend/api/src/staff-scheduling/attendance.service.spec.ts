import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, ShiftStatus, ShiftType, type Attendance, type StaffShift } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const ACTOR_ID = 'admin-1';

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

function buildAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'attendance-1',
    shiftId: 'shift-1',
    staffId: 'staff-1',
    status: AttendanceStatus.SCHEDULED,
    checkIn: null,
    checkOut: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: {
    staffShift: { findUnique: jest.Mock };
    attendance: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      staffShift: { findUnique: jest.fn() },
      attendance: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(AttendanceService);
  });

  describe('create', () => {
    it('throws NotFoundException when the shift does not exist', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(null);

      await expect(service.create({ shiftId: 'missing', status: 'present' }, ACTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });

    // A staff member should not have multiple attendance records for the same shift.
    it('rejects a duplicate attendance record for the same shift', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.attendance.findUnique.mockResolvedValue(buildAttendance());

      await expect(service.create({ shiftId: 'shift-1', status: 'present' }, ACTOR_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });

    it('rejects when checkOut is not after checkIn', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            shiftId: 'shift-1',
            status: 'present',
            checkIn: '2026-08-20T16:00:00.000Z',
            checkOut: '2026-08-20T08:00:00.000Z',
          },
          ACTOR_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });

    it('creates an attendance record, deriving staffId from the shift', async () => {
      prisma.staffShift.findUnique.mockResolvedValue(buildShift());
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue(buildAttendance({ status: AttendanceStatus.PRESENT }));

      const result = await service.create({ shiftId: 'shift-1', status: 'present' }, ACTOR_ID);

      expect(prisma.attendance.create).toHaveBeenCalledWith({
        data: {
          shiftId: 'shift-1',
          staffId: 'staff-1',
          status: AttendanceStatus.PRESENT,
          checkIn: undefined,
          checkOut: undefined,
          notes: undefined,
        },
      });
      expect(result.status).toBe('present');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the attendance record does not exist', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { status: 'present' }, ACTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the updated checkOut is not after checkIn', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        buildAttendance({ checkIn: new Date('2026-08-20T08:00:00.000Z') }),
      );

      await expect(
        service.update('attendance-1', { checkOut: '2026-08-20T07:00:00.000Z' }, ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.attendance.update).not.toHaveBeenCalled();
    });
  });
});
