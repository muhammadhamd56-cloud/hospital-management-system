import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShiftType, StaffType, type ShiftOpening } from '@prisma/client';
import { ShiftOpeningsService } from './shift-openings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { CreateShiftOpeningDto } from './dto/create-shift-opening.dto';

const ACTOR_ID = 'admin-1';

function buildOpening(overrides: Partial<ShiftOpening> = {}): ShiftOpening {
  return {
    id: 'opening-1',
    requiredStaffType: StaffType.NURSE,
    departmentId: null,
    date: new Date('2026-09-01T00:00:00.000Z'),
    startTime: new Date('2026-09-01T08:00:00.000Z'),
    endTime: new Date('2026-09-01T16:00:00.000Z'),
    shiftType: ShiftType.MORNING,
    positions: 2,
    applicationDeadline: new Date('2026-08-30T00:00:00.000Z'),
    notes: null,
    isOpen: true,
    createdById: ACTOR_ID,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ShiftOpeningsService', () => {
  let service: ShiftOpeningsService;
  let prisma: {
    shiftOpening: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    department: { upsert: jest.Mock };
  };
  let auditLog: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      shiftOpening: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      department: { upsert: jest.fn() },
    };
    auditLog = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftOpeningsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get(ShiftOpeningsService);
  });

  describe('create', () => {
    const dto: CreateShiftOpeningDto = {
      requiredStaffType: 'nurse',
      date: '2026-09-01',
      startTime: '2026-09-01T08:00:00.000Z',
      endTime: '2026-09-01T16:00:00.000Z',
      shiftType: 'morning',
      positions: 2,
      applicationDeadline: '2026-08-30T00:00:00.000Z',
    };

    it('throws BadRequestException when the end time is before the start time', async () => {
      await expect(
        service.create({ ...dto, startTime: '2026-09-01T16:00:00.000Z', endTime: '2026-09-01T08:00:00.000Z' }, ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shiftOpening.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the application deadline is after the shift starts', async () => {
      await expect(
        service.create({ ...dto, applicationDeadline: '2026-09-02T00:00:00.000Z' }, ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shiftOpening.create).not.toHaveBeenCalled();
    });

    it('creates the opening and logs an audit entry', async () => {
      const created = buildOpening();
      prisma.shiftOpening.create.mockResolvedValue({ ...created, department: null, applications: [] });

      const result = await service.create(dto, ACTOR_ID);

      expect(prisma.shiftOpening.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiredStaffType: StaffType.NURSE, positions: 2 }) }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'ShiftOpening' }));
      expect(result.requiredStaffType).toBe('nurse');
      expect(result.approvedCount).toBe(0);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the opening does not exist', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', {}, ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reducing positions below the number already approved', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({
        ...buildOpening({ positions: 2 }),
        department: null,
        applications: [{ status: 'APPROVED', staffId: 's1' }, { status: 'APPROVED', staffId: 's2' }],
      });

      await expect(service.update('opening-1', { positions: 1 }, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shiftOpening.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws ConflictException when the opening already has applications', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({ ...buildOpening(), applications: [{ id: 'app-1' }] });

      await expect(service.remove('opening-1', ACTOR_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.shiftOpening.delete).not.toHaveBeenCalled();
    });

    it('deletes an opening with no applications', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({ ...buildOpening(), applications: [] });

      await service.remove('opening-1', ACTOR_ID);

      expect(prisma.shiftOpening.delete).toHaveBeenCalledWith({ where: { id: 'opening-1' } });
    });
  });

  describe('findAvailableForStaff', () => {
    it('includes myApplicationStatus derived from the viewing staff member’s own application', async () => {
      prisma.shiftOpening.findMany.mockResolvedValue([
        { ...buildOpening(), department: null, applications: [{ status: 'PENDING', staffId: 'staff-1' }] },
      ]);

      const [opening] = await service.findAvailableForStaff('staff-1', 'nurse');

      expect(opening.myApplicationStatus).toBe('pending');
    });

    it('returns null myApplicationStatus when the staff member has not applied', async () => {
      prisma.shiftOpening.findMany.mockResolvedValue([{ ...buildOpening(), department: null, applications: [] }]);

      const [opening] = await service.findAvailableForStaff('staff-1', 'nurse');

      expect(opening.myApplicationStatus).toBeNull();
    });
  });
});
