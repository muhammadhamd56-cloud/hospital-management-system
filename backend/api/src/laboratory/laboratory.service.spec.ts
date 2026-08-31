import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabTestCategory, LabTestStatus, NotificationType, Role, StaffType, type Doctor, type LabTest } from '@prisma/client';
import { LaboratoryService } from './laboratory.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { RequestLabTestDto } from './dto/request-lab-test.dto';
import type { UpdateLabTestStatusDto } from './dto/update-lab-test-status.dto';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const labStaff: AuthenticatedUser = { id: 'lab-user-1', email: 'lab@example.com', role: Role.STAFF };
const nonLabStaff: AuthenticatedUser = { id: 'staff-user-1', email: 'staff@example.com', role: Role.STAFF };
const doctorCaller: AuthenticatedUser = { id: 'doctor-user-1', email: 'doc@example.com', role: Role.DOCTOR };

function buildDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'doctor-1',
    specialization: 'Cardiology',
    bio: 'Heart stuff',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    consultationFee: 0,
    appointmentDurationMinutes: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'doctor-user-1',
    departmentId: 'dept-1',
    ...overrides,
  };
}

function buildLabTest(overrides: Partial<LabTest> = {}): LabTest {
  return {
    id: 'test-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    assignedToId: null,
    testName: 'Complete Blood Count',
    category: LabTestCategory.HEMATOLOGY,
    status: LabTestStatus.PENDING,
    resultSummary: null,
    requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    ...overrides,
  };
}

function buildLabTestWithRelations(overrides: Partial<LabTest> = {}) {
  return {
    ...buildLabTest(overrides),
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
    doctor: {
      ...buildDoctor(),
      user: { firstName: 'Grace', lastName: 'Hopper' },
      department: { name: 'Cardiology' },
    },
    assignedTo: null,
  };
}

describe('LaboratoryService', () => {
  let service: LaboratoryService;
  let prisma: {
    labTest: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    doctor: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    staff: { findUnique: jest.Mock };
    appointment: { findMany: jest.Mock };
    chatMessage: { findMany: jest.Mock };
  };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      labTest: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      doctor: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      staff: { findUnique: jest.fn() },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    };

    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LaboratoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(LaboratoryService);
  });

  describe('findAll', () => {
    it('returns every test, unfiltered, for an admin caller', async () => {
      prisma.labTest.findMany.mockResolvedValue([buildLabTestWithRelations()]);

      const result = await service.findAll(admin);

      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
      expect(prisma.labTest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { requestedAt: 'desc' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].patientName).toBe('Ada Lovelace');
    });

    it('returns every test, unfiltered, for a STAFF caller who is a lab technician', async () => {
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.LAB_TECHNICIAN });
      prisma.labTest.findMany.mockResolvedValue([]);

      await service.findAll(labStaff);

      expect(prisma.staff.findUnique).toHaveBeenCalledWith({ where: { userId: labStaff.id } });
      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
      expect(prisma.labTest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('rejects a STAFF caller who is not a lab technician', async () => {
      prisma.staff.findUnique.mockResolvedValue({ staffType: StaffType.RECEPTIONIST });

      await expect(service.findAll(nonLabStaff)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.labTest.findMany).not.toHaveBeenCalled();
    });

    it('rejects a STAFF caller with no linked roster entry at all', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.findAll(nonLabStaff)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.labTest.findMany).not.toHaveBeenCalled();
    });

    it('scopes a doctor caller to patients they have an appointment or chat relationship with', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'patient-1' }]);
      prisma.chatMessage.findMany.mockResolvedValue([{ patientId: 'patient-2' }]);
      prisma.labTest.findMany.mockResolvedValue([]);

      await service.findAll(doctorCaller);

      expect(prisma.labTest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: { in: expect.arrayContaining(['patient-1', 'patient-2']) } },
        }),
      );
    });

    it('returns an empty array without querying tests when the doctor has no linked profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      const result = await service.findAll(doctorCaller);

      expect(result).toEqual([]);
      expect(prisma.labTest.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array without querying tests when the doctor has no patient relationships', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      const result = await service.findAll(doctorCaller);

      expect(result).toEqual([]);
      expect(prisma.labTest.findMany).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    const dto: RequestLabTestDto = {
      patientId: 'patient-1',
      doctorId: 'doctor-1',
      testName: 'Complete Blood Count',
      category: 'Hematology',
    };

    it('throws NotFoundException when the (admin-supplied) doctor does not exist', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.request(admin, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.labTest.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the patient does not exist', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.request(admin, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.labTest.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the target user is not a patient', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.user.findUnique.mockResolvedValue({ id: 'patient-1', role: Role.DOCTOR });

      await expect(service.request(admin, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the test with the admin-supplied doctorId and converts the category', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.user.findUnique.mockResolvedValue({ id: 'patient-1', role: Role.PATIENT });
      prisma.labTest.create.mockResolvedValue(buildLabTestWithRelations());

      const result = await service.request(admin, dto);

      expect(prisma.labTest.create).toHaveBeenCalledWith({
        data: {
          patientId: 'patient-1',
          doctorId: 'doctor-1',
          testName: 'Complete Blood Count',
          category: LabTestCategory.HEMATOLOGY,
        },
        include: expect.anything(),
      });
      expect(result.category).toBe('Hematology');
      expect(result.status).toBe('pending');
    });

    it('ignores a client-supplied doctorId and uses the caller\'s own linked doctor id when the caller is a DOCTOR', async () => {
      prisma.doctor.findUnique
        .mockResolvedValueOnce(buildDoctor({ id: 'doctor-1', userId: 'doctor-user-1' })) // requireOwnDoctorId lookup
        .mockResolvedValueOnce(buildDoctor({ id: 'doctor-1' })); // doctorExists check
      prisma.user.findUnique.mockResolvedValue({ id: 'patient-1', role: Role.PATIENT });
      prisma.labTest.create.mockResolvedValue(buildLabTestWithRelations());

      await service.request(doctorCaller, { ...dto, doctorId: 'someone-elses-doctor-id' });

      expect(prisma.doctor.findUnique).toHaveBeenNthCalledWith(1, { where: { userId: 'doctor-user-1' } });
      expect(prisma.labTest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ doctorId: 'doctor-1' }) }),
      );
    });

    it('throws NotFoundException when a DOCTOR caller has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.request(doctorCaller, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.labTest.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException when the test does not exist', async () => {
      prisma.labTest.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(admin, 'missing', { status: 'in-progress' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates status without firing a notification when not transitioning into completed', async () => {
      prisma.labTest.findUnique.mockResolvedValue(buildLabTest({ status: LabTestStatus.PENDING }));
      prisma.labTest.update.mockResolvedValue(buildLabTestWithRelations({ status: LabTestStatus.IN_PROGRESS }));

      const dto: UpdateLabTestStatusDto = { status: 'in-progress' };
      const result = await service.updateStatus(admin, 'test-1', dto);

      expect(prisma.labTest.update).toHaveBeenCalledWith({
        where: { id: 'test-1' },
        data: { status: LabTestStatus.IN_PROGRESS, resultSummary: null, completedAt: null },
        include: expect.anything(),
      });
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(result.status).toBe('in-progress');
    });

    it('sets completedAt and notifies both patient and doctor when transitioning into completed', async () => {
      prisma.labTest.findUnique.mockResolvedValue(buildLabTest({ status: LabTestStatus.IN_PROGRESS }));
      const updated = buildLabTestWithRelations({ status: LabTestStatus.COMPLETED, resultSummary: 'Normal' });
      prisma.labTest.update.mockResolvedValue(updated);

      const dto: UpdateLabTestStatusDto = { status: 'completed', resultSummary: 'Normal' };
      const result = await service.updateStatus(admin, 'test-1', dto);

      const updateArgs = prisma.labTest.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(LabTestStatus.COMPLETED);
      expect(updateArgs.data.resultSummary).toBe('Normal');
      expect(updateArgs.data.completedAt).toBeInstanceOf(Date);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.LAB_RESULT_READY,
        'Lab result ready',
        expect.stringContaining('Complete Blood Count'),
        '/medical-records',
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'doctor-user-1',
        NotificationType.LAB_RESULT_READY,
        'Lab result ready',
        expect.stringContaining('Ada Lovelace'),
        '/laboratory',
      );
      expect(result.status).toBe('completed');
    });

    it('does not re-fire the notification when the test is already completed', async () => {
      prisma.labTest.findUnique.mockResolvedValue(
        buildLabTest({ status: LabTestStatus.COMPLETED, completedAt: new Date('2026-01-02T00:00:00.000Z') }),
      );
      prisma.labTest.update.mockResolvedValue(buildLabTestWithRelations({ status: LabTestStatus.COMPLETED }));

      await service.updateStatus(admin, 'test-1', { status: 'completed' });

      expect(notificationsService.create).not.toHaveBeenCalled();
      const updateArgs = prisma.labTest.update.mock.calls[0][0];
      expect(updateArgs.data.completedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
    });

    it('keeps the existing resultSummary when none is provided', async () => {
      prisma.labTest.findUnique.mockResolvedValue(buildLabTest({ resultSummary: 'Existing note' }));
      prisma.labTest.update.mockResolvedValue(buildLabTestWithRelations());

      await service.updateStatus(admin, 'test-1', { status: 'in-progress' });

      const updateArgs = prisma.labTest.update.mock.calls[0][0];
      expect(updateArgs.data.resultSummary).toBe('Existing note');
    });
  });
});
