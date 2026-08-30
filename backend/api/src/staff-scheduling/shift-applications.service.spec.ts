import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, ShiftType, StaffType, type ShiftApplication, type ShiftOpening } from '@prisma/client';
import { ShiftApplicationsService } from './shift-applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShiftsService } from './shifts.service';

const USER_ID = 'nurse-user-1';
const STAFF_ID = 'staff-1';
const ADMIN_ID = 'admin-1';

function buildOpening(overrides: Partial<ShiftOpening> = {}): ShiftOpening {
  return {
    id: 'opening-1',
    requiredStaffType: StaffType.NURSE,
    departmentId: null,
    date: new Date('2026-09-01T00:00:00.000Z'),
    startTime: new Date('2026-09-01T08:00:00.000Z'),
    endTime: new Date('2026-09-01T16:00:00.000Z'),
    shiftType: ShiftType.MORNING,
    positions: 1,
    applicationDeadline: new Date(Date.now() + 60 * 60 * 1000),
    notes: null,
    isOpen: true,
    createdById: ADMIN_ID,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildApplication(overrides: Partial<ShiftApplication> = {}): ShiftApplication {
  return {
    id: 'application-1',
    openingId: 'opening-1',
    staffId: STAFF_ID,
    status: ApplicationStatus.PENDING,
    message: null,
    adminNotes: null,
    respondedById: null,
    respondedAt: null,
    resultingShiftId: null,
    appliedAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ShiftApplicationsService', () => {
  let service: ShiftApplicationsService;
  let prisma: {
    staff: { findUnique: jest.Mock };
    shiftOpening: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    shiftApplication: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let auditLog: { log: jest.Mock };
  let notifications: { create: jest.Mock };
  let shiftsService: { assertNoSchedulingConflict: jest.Mock; assignFromOpening: jest.Mock };

  beforeEach(async () => {
    prisma = {
      staff: { findUnique: jest.fn() },
      shiftOpening: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      shiftApplication: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    auditLog = { log: jest.fn() };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    shiftsService = {
      assertNoSchedulingConflict: jest.fn().mockResolvedValue(undefined),
      assignFromOpening: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: NotificationsService, useValue: notifications },
        { provide: ShiftsService, useValue: shiftsService },
      ],
    }).compile();

    service = module.get(ShiftApplicationsService);
  });

  describe('apply', () => {
    beforeEach(() => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID, staffType: StaffType.NURSE, userId: USER_ID, isActive: true });
    });

    it('throws NotFoundException when the caller has no linked staff roster entry', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the staff member is not active', async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID, staffType: StaffType.NURSE, userId: USER_ID, isActive: false });

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.shiftOpening.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the opening does not exist', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue(null);

      await expect(service.apply(USER_ID, 'missing', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the opening is closed', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({ ...buildOpening({ isOpen: false }), applications: [] });

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the application deadline has passed', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({
        ...buildOpening({ applicationDeadline: new Date(Date.now() - 1000) }),
        applications: [],
      });

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when the opening requires a different staff role', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({
        ...buildOpening({ requiredStaffType: StaffType.LAB_TECHNICIAN }),
        applications: [],
      });

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when the shift is already full', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({
        ...buildOpening({ positions: 1 }),
        applications: [{ status: 'APPROVED' }],
      });

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when the staff member already applied to this opening', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({ ...buildOpening(), applications: [] });
      prisma.shiftApplication.findUnique.mockResolvedValue(buildApplication());

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.shiftApplication.create).not.toHaveBeenCalled();
    });

    it('propagates the scheduling-conflict check (e.g. an overlapping shift) before creating an application', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({ ...buildOpening(), applications: [] });
      prisma.shiftApplication.findUnique.mockResolvedValue(null);
      shiftsService.assertNoSchedulingConflict.mockRejectedValue(new ConflictException('conflict'));

      await expect(service.apply(USER_ID, 'opening-1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.shiftApplication.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING application when every check passes', async () => {
      prisma.shiftOpening.findUnique.mockResolvedValue({ ...buildOpening(), applications: [] });
      prisma.shiftApplication.findUnique.mockResolvedValue(null);
      prisma.shiftApplication.create.mockResolvedValue({
        ...buildApplication(),
        opening: { ...buildOpening(), department: null },
        staff: { id: STAFF_ID, staffType: StaffType.NURSE, fullName: 'Sara', email: null, isActive: true, userId: USER_ID, department: null, createdAt: new Date(), updatedAt: new Date() },
      });

      const result = await service.apply(USER_ID, 'opening-1', { message: 'Happy to cover this' });

      expect(prisma.shiftApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { openingId: 'opening-1', staffId: STAFF_ID, message: 'Happy to cover this' } }),
      );
      expect(result.status).toBe('pending');
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'ShiftApplication' }));
    });
  });

  describe('withdraw', () => {
    it('throws NotFoundException when the application does not belong to the caller', async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.shiftApplication.findUnique.mockResolvedValue(buildApplication({ staffId: 'someone-else' }));

      await expect(service.withdraw(USER_ID, 'application-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the application is not pending', async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.shiftApplication.findUnique.mockResolvedValue(buildApplication({ status: ApplicationStatus.APPROVED }));

      await expect(service.withdraw(USER_ID, 'application-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('respond', () => {
    const staffWithUser = {
      id: STAFF_ID,
      staffType: StaffType.NURSE,
      fullName: 'Sara',
      email: null,
      isActive: true,
      userId: USER_ID,
      department: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const openingWithDept = { ...buildOpening(), department: { id: 'dept-1', name: 'Emergency', description: null, createdAt: new Date() } };

    it('throws NotFoundException when the application does not exist', async () => {
      prisma.shiftApplication.findUnique.mockResolvedValue(null);

      await expect(service.respond('missing', { decision: 'approve' }, ADMIN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the application was already responded to', async () => {
      prisma.shiftApplication.findUnique.mockResolvedValue({
        ...buildApplication({ status: ApplicationStatus.APPROVED }),
        staff: staffWithUser,
        opening: openingWithDept,
      });

      await expect(service.respond('application-1', { decision: 'approve' }, ADMIN_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an application, notifies the staff member, and never touches ShiftsService', async () => {
      prisma.shiftApplication.findUnique.mockResolvedValue({
        ...buildApplication(),
        staff: staffWithUser,
        opening: openingWithDept,
      });
      prisma.shiftApplication.update.mockResolvedValue({
        ...buildApplication({ status: ApplicationStatus.REJECTED }),
        opening: openingWithDept,
        staff: staffWithUser,
      });

      const result = await service.respond('application-1', { decision: 'reject', adminNotes: 'Not needed' }, ADMIN_ID);

      expect(result.status).toBe('rejected');
      expect(shiftsService.assignFromOpening).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        USER_ID,
        'SHIFT_APPLICATION_REJECTED',
        expect.any(String),
        expect.any(String),
      );
    });

    it('approves an application: creates the shift via ShiftsService, marks APPROVED, links resultingShiftId, and notifies', async () => {
      prisma.shiftApplication.findUnique.mockResolvedValue({
        ...buildApplication(),
        staff: staffWithUser,
        opening: openingWithDept,
      });
      prisma.shiftOpening.findUniqueOrThrow.mockResolvedValue({ ...openingWithDept, applications: [] });
      shiftsService.assignFromOpening.mockResolvedValue({ id: 'shift-1' });
      prisma.shiftApplication.update.mockResolvedValue({
        ...buildApplication({ status: ApplicationStatus.APPROVED, resultingShiftId: 'shift-1' }),
        opening: openingWithDept,
        staff: staffWithUser,
      });

      const result = await service.respond('application-1', { decision: 'approve' }, ADMIN_ID);

      expect(shiftsService.assignFromOpening).toHaveBeenCalledWith(
        expect.objectContaining({ staffId: STAFF_ID, createdById: ADMIN_ID, notify: false }),
      );
      expect(prisma.shiftApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ApplicationStatus.APPROVED, resultingShiftId: 'shift-1' }) }),
      );
      expect(result.status).toBe('approved');
      expect(notifications.create).toHaveBeenCalledWith(
        USER_ID,
        'SHIFT_APPLICATION_APPROVED',
        expect.any(String),
        expect.any(String),
      );
    });

    it('throws BadRequestException when re-checked capacity shows the shift is now full (race with another approval)', async () => {
      prisma.shiftApplication.findUnique.mockResolvedValue({
        ...buildApplication(),
        staff: staffWithUser,
        opening: openingWithDept,
      });
      prisma.shiftOpening.findUniqueOrThrow.mockResolvedValue({
        ...openingWithDept,
        positions: 1,
        applications: [{ status: 'APPROVED' }],
      });

      await expect(service.respond('application-1', { decision: 'approve' }, ADMIN_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(shiftsService.assignFromOpening).not.toHaveBeenCalled();
    });

    it('auto-closes the opening once the last position is filled', async () => {
      prisma.shiftApplication.findUnique.mockResolvedValue({
        ...buildApplication(),
        staff: staffWithUser,
        opening: openingWithDept,
      });
      prisma.shiftOpening.findUniqueOrThrow.mockResolvedValue({ ...openingWithDept, positions: 1, applications: [] });
      shiftsService.assignFromOpening.mockResolvedValue({ id: 'shift-1' });
      prisma.shiftApplication.update.mockResolvedValue({
        ...buildApplication({ status: ApplicationStatus.APPROVED }),
        opening: openingWithDept,
        staff: staffWithUser,
      });

      await service.respond('application-1', { decision: 'approve' }, ADMIN_ID);

      expect(prisma.shiftOpening.update).toHaveBeenCalledWith({ where: { id: openingWithDept.id }, data: { isOpen: false } });
    });
  });
});
