import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EmergencyPriority,
  EmergencyStatus,
  EmergencyType,
  NotificationType,
  Role,
  StaffType,
  type EmergencyCase,
} from '@prisma/client';
import { EmergencyService } from './emergency.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

const patient: AuthenticatedUser = { id: 'patient-1', email: 'patient@example.com', role: Role.PATIENT };
const otherPatient: AuthenticatedUser = { id: 'patient-2', email: 'patient2@example.com', role: Role.PATIENT };
const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const doctor: AuthenticatedUser = { id: 'doctor-user-1', email: 'doctor@example.com', role: Role.DOCTOR };
const nurse: AuthenticatedUser = { id: 'nurse-user-1', email: 'nurse@example.com', role: Role.STAFF };
const receptionist: AuthenticatedUser = { id: 'reception-user-1', email: 'reception@example.com', role: Role.STAFF };

function buildCase(overrides: Partial<EmergencyCase> = {}): EmergencyCase {
  return {
    id: 'case-1',
    patientId: 'patient-1',
    emergencyType: EmergencyType.OTHER,
    description: null,
    priority: EmergencyPriority.NORMAL,
    status: EmergencyStatus.NEW,
    locationShared: false,
    locationLat: null,
    locationLng: null,
    acknowledgedById: null,
    acknowledgedAt: null,
    assignedDoctorId: null,
    assignedStaffId: null,
    assignedTeamName: null,
    assignedById: null,
    assignedAt: null,
    respondingAt: null,
    arrivedAt: null,
    resolvedById: null,
    resolvedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildCaseWithRelations(overrides: Partial<EmergencyCase> = {}) {
  return {
    ...buildCase(overrides),
    patient: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '555-0100',
      dateOfBirth: null,
      emergencyContactName: 'Bob Lovelace',
      emergencyContactPhone: '555-0101',
    },
    acknowledgedBy: null,
    assignedDoctor: null,
    assignedStaff: null,
    assignedBy: null,
    resolvedBy: null,
    notes: [],
  };
}

describe('EmergencyService', () => {
  let service: EmergencyService;
  let prisma: {
    emergencyCase: { findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    emergencyNote: { create: jest.Mock };
    user: { findMany: jest.Mock };
    staff: { findUnique: jest.Mock; findMany: jest.Mock };
    doctor: { findUnique: jest.Mock };
  };
  let notificationsService: { create: jest.Mock };
  let auditLogService: { log: jest.Mock; findForEntity: jest.Mock };

  beforeEach(async () => {
    prisma = {
      emergencyCase: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emergencyNote: { create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      staff: { findUnique: jest.fn(), findMany: jest.fn() },
      doctor: { findUnique: jest.fn() },
    };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined), findForEntity: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(EmergencyService);
  });

  describe('create', () => {
    it('rejects a second active request from the same patient', async () => {
      prisma.emergencyCase.findFirst.mockResolvedValue(buildCase());

      await expect(service.create(patient, {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.emergencyCase.create).not.toHaveBeenCalled();
    });

    it('creates a bare case immediately with no type/description supplied, defaulting type to OTHER', async () => {
      prisma.emergencyCase.findFirst.mockResolvedValue(null);
      prisma.emergencyCase.create.mockResolvedValue(buildCaseWithRelations());
      prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'nurse-user-1' }]);

      const result = await service.create(patient, {});

      expect(prisma.emergencyCase.create).toHaveBeenCalledWith({
        data: { patientId: 'patient-1', emergencyType: EmergencyType.OTHER, description: null },
        include: expect.anything(),
      });
      expect(result.status).toBe('new');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'patient-1', action: 'CREATE', entityType: 'EmergencyCase' }),
      );
    });

    it('notifies every admin and nurse-type staff, not every doctor', async () => {
      prisma.emergencyCase.findFirst.mockResolvedValue(null);
      prisma.emergencyCase.create.mockResolvedValue(buildCaseWithRelations());
      prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'nurse-user-1' }]);

      await service.create(patient, { emergencyType: 'chest_related' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ role: Role.ADMIN }, { role: Role.STAFF, staffProfile: { staffType: StaffType.NURSE } }] },
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        'admin-1',
        NotificationType.EMERGENCY_CREATED,
        expect.any(String),
        expect.any(String),
        '/emergency/cases/case-1',
      );
    });
  });

  describe('findOne', () => {
    it('returns the case for its own patient', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCaseWithRelations());

      const result = await service.findOne(patient, 'case-1');

      expect(result.id).toBe('case-1');
      expect(result.patientContact).toBeUndefined();
    });

    it('404s for a different patient (never reveals the case exists)', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCaseWithRelations());

      await expect(service.findOne(otherPatient, 'case-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s for an unauthorized (non-nurse) staff caller', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCaseWithRelations());
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.RECEPTIONIST });

      await expect(service.findOne(receptionist, 'case-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('includes location + patient contact for a responder, and logs a VIEW when location was shared', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(
        buildCaseWithRelations({ locationShared: true, locationLat: 1.23, locationLng: 4.56 }),
      );

      const result = await service.findOne(admin, 'case-1');

      expect(result.location).toEqual({ lat: 1.23, lng: 4.56 });
      expect(result.patientContact?.emergencyContactName).toBe('Bob Lovelace');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'admin-1', action: 'VIEW', entityType: 'EmergencyCase', entityId: 'case-1' }),
      );
    });

    it('does not log a VIEW when location was never shared', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCaseWithRelations({ locationShared: false }));

      await service.findOne(admin, 'case-1');

      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the case does not exist', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(null);

      await expect(service.findOne(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('rejects an unauthorized staff caller', async () => {
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.RECEPTIONIST });

      await expect(
        service.updateStatus(receptionist, 'case-1', { status: 'acknowledged' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.emergencyCase.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an invalid transition (NEW -> RESOLVED)', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.NEW }));

      await expect(
        service.updateStatus(admin, 'case-1', { status: 'resolved' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.emergencyCase.update).not.toHaveBeenCalled();
    });

    it('rejects going straight to responding without an assigned team', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.ACKNOWLEDGED }));

      await expect(
        service.updateStatus(admin, 'case-1', { status: 'responding' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('acknowledges a NEW case and notifies the patient', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.NEW }));
      prisma.emergencyCase.update.mockResolvedValue(
        buildCaseWithRelations({ status: EmergencyStatus.ACKNOWLEDGED, acknowledgedById: 'nurse-user-1' }),
      );
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.NURSE });

      const result = await service.updateStatus(nurse, 'case-1', { status: 'acknowledged' });

      expect(prisma.emergencyCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EmergencyStatus.ACKNOWLEDGED, acknowledgedById: 'nurse-user-1' }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.EMERGENCY_ACKNOWLEDGED,
        expect.any(String),
        expect.stringContaining('acknowledged'),
        '/emergency/cases/case-1',
      );
      expect(result.status).toBe('acknowledged');
    });

    it('resolves an ARRIVED case and notifies the patient with EMERGENCY_RESOLVED', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.ARRIVED }));
      prisma.emergencyCase.update.mockResolvedValue(buildCaseWithRelations({ status: EmergencyStatus.RESOLVED }));

      await service.updateStatus(admin, 'case-1', { status: 'resolved' });

      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.EMERGENCY_RESOLVED,
        expect.any(String),
        expect.any(String),
        '/emergency/cases/case-1',
      );
    });
  });

  describe('assign', () => {
    it('rejects a nurse caller (assigner access is admin/doctor only)', async () => {
      await expect(
        service.assign(nurse, 'case-1', { doctorId: 'doctor-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires at least one of doctorId/staffId/teamName', async () => {
      await expect(service.assign(admin, 'case-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects assigning before the case has been acknowledged', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.NEW }));

      await expect(
        service.assign(admin, 'case-1', { teamName: 'Team A' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects assigning a non-nurse staff member', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.ACKNOWLEDGED }));
      prisma.staff.findUnique.mockResolvedValue({ id: 'staff-1', staffType: StaffType.RECEPTIONIST, userId: 'x' });

      await expect(
        service.assign(admin, 'case-1', { staffId: 'staff-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('assigns a doctor + nurse, advances status to TEAM_ASSIGNED, and notifies patient + assignees', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.ACKNOWLEDGED }));
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1' });
      prisma.staff.findUnique.mockResolvedValue({ id: 'staff-1', staffType: StaffType.NURSE, userId: 'nurse-user-1' });
      prisma.emergencyCase.update.mockResolvedValue({
        ...buildCaseWithRelations({ status: EmergencyStatus.TEAM_ASSIGNED }),
        assignedDoctor: { userId: 'doctor-user-1' },
      });

      const result = await service.assign(doctor, 'case-1', { doctorId: 'doctor-1', staffId: 'staff-1' });

      expect(prisma.emergencyCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EmergencyStatus.TEAM_ASSIGNED,
            assignedDoctorId: 'doctor-1',
            assignedStaffId: 'staff-1',
            assignedById: 'doctor-user-1',
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.EMERGENCY_TEAM_ASSIGNED,
        expect.any(String),
        expect.any(String),
        '/emergency/cases/case-1',
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'doctor-user-1',
        NotificationType.EMERGENCY_TEAM_ASSIGNED,
        expect.any(String),
        expect.any(String),
        '/emergency/cases/case-1',
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'nurse-user-1',
        NotificationType.EMERGENCY_TEAM_ASSIGNED,
        expect.any(String),
        expect.any(String),
        '/emergency/cases/case-1',
      );
      expect(result.status).toBe('team_assigned');
    });
  });

  describe('updatePriority', () => {
    it('rejects a nurse caller', async () => {
      await expect(
        service.updatePriority(nurse, 'case-1', { priority: 'critical' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates priority for an admin caller', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase());
      prisma.emergencyCase.update.mockResolvedValue(buildCaseWithRelations({ priority: EmergencyPriority.CRITICAL }));

      const result = await service.updatePriority(admin, 'case-1', { priority: 'critical' });

      expect(result.priority).toBe('critical');
    });
  });

  describe('cancel', () => {
    it('lets the owning patient cancel a NEW case', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.NEW }));
      prisma.emergencyCase.update.mockResolvedValue(buildCaseWithRelations({ status: EmergencyStatus.CANCELLED }));

      const result = await service.cancel(patient, 'case-1', {});

      expect(result.status).toBe('cancelled');
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('404s a different patient trying to cancel', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.NEW }));

      await expect(service.cancel(otherPatient, 'case-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects the patient cancelling once a team is responding', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.RESPONDING }));

      await expect(service.cancel(patient, 'case-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets an admin cancel at a later stage and notifies the patient', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.RESPONDING }));
      prisma.emergencyCase.update.mockResolvedValue(buildCaseWithRelations({ status: EmergencyStatus.CANCELLED }));

      await service.cancel(admin, 'case-1', { reason: 'False alarm' });

      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.EMERGENCY_CANCELLED,
        expect.any(String),
        expect.any(String),
        '/emergency/cases/case-1',
      );
    });

    it('rejects cancelling an already-resolved case', async () => {
      prisma.emergencyCase.findUnique.mockResolvedValue(buildCase({ status: EmergencyStatus.RESOLVED }));

      await expect(service.cancel(admin, 'case-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listAll', () => {
    it('rejects a non-nurse staff caller', async () => {
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.LAB_TECHNICIAN });

      await expect(service.listAll(receptionist, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.emergencyCase.findMany).not.toHaveBeenCalled();
    });

    it('allows a nurse caller and applies filters', async () => {
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.NURSE });
      prisma.emergencyCase.findMany.mockResolvedValue([]);

      await service.listAll(nurse, { status: 'new', priority: 'critical' });

      expect(prisma.emergencyCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: EmergencyStatus.NEW, priority: EmergencyPriority.CRITICAL }),
        }),
      );
    });
  });

  describe('listAssignableNurses', () => {
    it('rejects a nurse caller (only admin/doctor manage assignment)', async () => {
      await expect(service.listAssignableNurses(nurse)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns active nurses for an admin caller', async () => {
      prisma.staff.findMany.mockResolvedValue([
        { id: 'staff-1', fullName: 'Nurse Joy', user: { firstName: 'Nurse', lastName: 'Joy' } },
      ]);

      const result = await service.listAssignableNurses(admin);

      expect(prisma.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { staffType: StaffType.NURSE, isActive: true } }),
      );
      expect(result).toEqual([{ id: 'staff-1', fullName: 'Nurse Joy' }]);
    });
  });

  describe('analytics', () => {
    it('rejects a non-admin caller', async () => {
      await expect(service.analytics(doctor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('computes counts and average durations for an admin caller', async () => {
      const created = new Date('2026-01-01T00:00:00.000Z');
      const acknowledged = new Date('2026-01-01T00:05:00.000Z');
      const resolved = new Date('2026-01-01T01:00:00.000Z');

      prisma.emergencyCase.findMany.mockResolvedValue([
        {
          status: EmergencyStatus.RESOLVED,
          priority: EmergencyPriority.HIGH,
          emergencyType: EmergencyType.MEDICAL,
          createdAt: created,
          acknowledgedAt: acknowledged,
          assignedAt: null,
          respondingAt: null,
          resolvedAt: resolved,
        },
      ]);

      const result = await service.analytics(admin);

      expect(result.totalCases).toBe(1);
      expect(result.byStatus[EmergencyStatus.RESOLVED]).toBe(1);
      expect(result.avgAcknowledgeSeconds).toBe(300);
      expect(result.avgResolutionSeconds).toBe(3600);
      expect(result.volumeByDay).toEqual([{ date: '2026-01-01', count: 1 }]);
    });
  });
});
