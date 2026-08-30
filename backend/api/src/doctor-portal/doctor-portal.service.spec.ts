import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { DoctorPortalService } from './doctor-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicalRecordsService } from '../medical-records/medical-records.service';
import type { DoctorWithUser } from '../doctors/doctors.service';
import type { AppointmentWithPatient } from '../appointments/appointment.mapper';
import type { ChatMessage } from '@prisma/client';
import type { DoctorProfileDto } from './dto/doctor-profile.dto';
import type { CreateMedicalRecordDto } from '../medical-records/dto/create-medical-record.dto';

function buildDoctor(overrides: Partial<DoctorWithUser> = {}): DoctorWithUser {
  return {
    id: 'doctor-1',
    specialization: 'Cardiology',
    bio: 'Heart specialist',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    consultationFee: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user-1',
    departmentId: 'dept-1',
    user: { firstName: 'Greta', lastName: 'House', email: 'greta@example.com' },
    department: { name: 'Cardiology' },
    ...overrides,
  } as DoctorWithUser;
}

function buildAppointment(overrides: Partial<AppointmentWithPatient> = {}): AppointmentWithPatient {
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    scheduledAt: new Date('2026-02-01T10:00:00.000Z'),
    mode: 'ONLINE',
    status: 'SCHEDULED',
    reason: 'Checkup',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
    ...overrides,
  } as AppointmentWithPatient;
}

function buildChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    sender: 'PATIENT',
    body: 'Hello doctor',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as ChatMessage;
}

describe('DoctorPortalService', () => {
  let service: DoctorPortalService;
  let prisma: {
    doctor: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    department: { upsert: jest.Mock };
    appointment: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    chatMessage: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock };
    user: { findMany: jest.Mock };
  };
  let notificationsService: { create: jest.Mock };
  let medicalRecordsService: { listForPatientByDoctor: jest.Mock; createForPatient: jest.Mock };

  beforeEach(async () => {
    prisma = {
      doctor: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
      department: { upsert: jest.fn() },
      appointment: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      chatMessage: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
      user: { findMany: jest.fn() },
    };

    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };
    medicalRecordsService = { listForPatientByDoctor: jest.fn(), createForPatient: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: MedicalRecordsService, useValue: medicalRecordsService },
      ],
    }).compile();

    service = module.get(DoctorPortalService);
  });

  describe('getProfile', () => {
    it('returns null when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('user-1')).resolves.toBeNull();
    });

    it('returns the mapped directory profile when a doctor is linked', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      const result = await service.getProfile('user-1');

      expect(result).toMatchObject({ id: 'doctor-1', fullName: 'Greta House', specialization: 'Cardiology' });
      expect(prisma.doctor.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: expect.anything(),
      });
    });
  });

  describe('upsertProfile', () => {
    const dto: DoctorProfileDto = {
      specialization: 'Neurology',
      department: 'Neurology',
      bio: 'Brain stuff',
      experienceYears: 5,
      consultationFee: 100,
    };

    it('creates a new Doctor row when the user has no existing profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);
      prisma.department.upsert.mockResolvedValue({ id: 'dept-2', name: 'Neurology' });
      const created = buildDoctor({ id: 'doctor-2', specialization: 'Neurology', departmentId: 'dept-2' });
      prisma.doctor.create.mockResolvedValue(created);

      const result = await service.upsertProfile('user-1', dto);

      expect(prisma.department.upsert).toHaveBeenCalledWith({
        where: { name: 'Neurology' },
        update: {},
        create: { name: 'Neurology' },
      });
      expect(prisma.doctor.create).toHaveBeenCalledWith({
        data: {
          specialization: 'Neurology',
          departmentId: 'dept-2',
          bio: 'Brain stuff',
          experienceYears: 5,
          consultationFee: 100,
          userId: 'user-1',
        },
        include: expect.anything(),
      });
      expect(prisma.doctor.update).not.toHaveBeenCalled();
      expect(result.specialization).toBe('Neurology');
    });

    it('updates the existing Doctor row when the user already has a profile', async () => {
      const existing = buildDoctor({ id: 'doctor-1' });
      prisma.doctor.findUnique.mockResolvedValue(existing);
      prisma.department.upsert.mockResolvedValue({ id: 'dept-2', name: 'Neurology' });
      const updated = buildDoctor({ specialization: 'Neurology', departmentId: 'dept-2' });
      prisma.doctor.update.mockResolvedValue(updated);

      const result = await service.upsertProfile('user-1', dto);

      expect(prisma.doctor.update).toHaveBeenCalledWith({
        where: { id: 'doctor-1' },
        data: {
          specialization: 'Neurology',
          departmentId: 'dept-2',
          bio: 'Brain stuff',
          experienceYears: 5,
          consultationFee: 100,
        },
        include: expect.anything(),
      });
      expect(prisma.doctor.create).not.toHaveBeenCalled();
      expect(result.specialization).toBe('Neurology');
    });
  });

  describe('setAvailability', () => {
    it('throws NotFoundException when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.setAvailability('user-1', true)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.doctor.update).not.toHaveBeenCalled();
    });

    it("updates only the calling doctor's own row, scoped by their doctor id", async () => {
      const doctor = buildDoctor({ id: 'doctor-1', userId: 'user-1' });
      prisma.doctor.findUnique.mockResolvedValue(doctor);
      prisma.doctor.update.mockResolvedValue(buildDoctor({ isAvailable: false }));

      const result = await service.setAvailability('user-1', false);

      expect(prisma.doctor.update).toHaveBeenCalledWith({
        where: { id: 'doctor-1' },
        data: { isAvailable: false },
        include: expect.anything(),
      });
      expect(result.isAvailable).toBe(false);
    });
  });

  describe('listAppointments', () => {
    it('returns an empty list when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.listAppointments('user-1')).resolves.toEqual([]);
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it("lists only the calling doctor's own appointments, ordered by scheduled time", async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findMany.mockResolvedValue([buildAppointment()]);

      const result = await service.listAppointments('user-1');

      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: { doctorId: 'doctor-1' },
        include: expect.anything(),
        orderBy: { scheduledAt: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'appt-1', patientName: 'Ada Lovelace', status: 'scheduled' });
    });
  });

  describe('cancelAppointment', () => {
    it('throws NotFoundException when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.cancelAppointment('user-1', 'appt-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the appointment does not exist', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.cancelAppointment('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFoundException when the appointment belongs to a different doctor — can't cancel another doctor's session", async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ doctorId: 'someone-elses-doctor-id' }));

      await expect(service.cancelAppointment('user-1', 'appt-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the appointment is not in SCHEDULED status', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ doctorId: 'doctor-1', status: 'COMPLETED' }));

      await expect(service.cancelAppointment('user-1', 'appt-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('cancels the appointment and notifies the patient', async () => {
      const doctor = buildDoctor({ id: 'doctor-1', user: { firstName: 'Greta', lastName: 'House', email: 'g@example.com' } });
      prisma.doctor.findUnique.mockResolvedValue(doctor);
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ doctorId: 'doctor-1', status: 'SCHEDULED' }));
      const updated = buildAppointment({ doctorId: 'doctor-1', status: 'CANCELLED' });
      prisma.appointment.update.mockResolvedValue(updated);

      const result = await service.cancelAppointment('user-1', 'appt-1');

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'CANCELLED' },
        include: expect.anything(),
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        updated.patientId,
        NotificationType.APPOINTMENT_CANCELLED,
        'Appointment cancelled',
        expect.stringContaining('Dr. Greta House cancelled your session'),
      );
      expect(result.status).toBe('cancelled');
    });
  });

  describe('completeAppointment', () => {
    it('throws BadRequestException when the appointment is not in SCHEDULED status', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ doctorId: 'doctor-1', status: 'CANCELLED' }));

      await expect(service.completeAppointment('user-1', 'appt-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('completes the appointment without notifying the patient', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ doctorId: 'doctor-1', status: 'SCHEDULED' }));
      const updated = buildAppointment({ doctorId: 'doctor-1', status: 'COMPLETED' });
      prisma.appointment.update.mockResolvedValue(updated);

      const result = await service.completeAppointment('user-1', 'appt-1');

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'COMPLETED' },
        include: expect.anything(),
      });
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(result.status).toBe('completed');
    });
  });

  describe('listInboxPatients', () => {
    it('returns an empty list when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.listInboxPatients('user-1')).resolves.toEqual([]);
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty list when the doctor has neither appointments nor messages', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.chatMessage.findMany.mockResolvedValue([]);

      await expect(service.listInboxPatients('user-1')).resolves.toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('merges patients from appointments and messages, de-duplicates, and sorts by name', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'patient-1' }, { patientId: 'patient-2' }]);
      prisma.chatMessage.findMany.mockResolvedValue([{ patientId: 'patient-2' }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'patient-1', firstName: 'Zoe', lastName: 'Zephyr' },
        { id: 'patient-2', firstName: 'Ada', lastName: 'Lovelace' },
      ]);

      const result = await service.listInboxPatients('user-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['patient-1', 'patient-2'] } },
        select: { id: true, firstName: true, lastName: true },
      });
      expect(result).toEqual([
        { patientId: 'patient-2', patientName: 'Ada Lovelace' },
        { patientId: 'patient-1', patientName: 'Zoe Zephyr' },
      ]);
    });
  });

  describe('getThread', () => {
    it('throws NotFoundException when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getThread('user-1', 'patient-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the patient is not in the doctor\'s inbox (no appointment or message relationship)', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(service.getThread('user-1', 'patient-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it('returns the mapped thread when the doctor has a relationship with the patient via an appointment', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(buildAppointment());
      prisma.chatMessage.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findMany.mockResolvedValue([buildChatMessage()]);

      const result = await service.getThread('user-1', 'patient-1');

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { doctorId: 'doctor-1', patientId: 'patient-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'msg-1', sender: 'patient', body: 'Hello doctor' });
    });

    it('returns the mapped thread when the doctor has a relationship with the patient via a prior message', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue(buildChatMessage());
      prisma.chatMessage.findMany.mockResolvedValue([buildChatMessage()]);

      await expect(service.getThread('user-1', 'patient-1')).resolves.toHaveLength(1);
    });
  });

  describe('sendMessage', () => {
    it('throws NotFoundException when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.sendMessage('user-1', 'patient-1', 'hi')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the patient is not in the inbox', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(service.sendMessage('user-1', 'patient-1', 'hi')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('creates the message as sent by DOCTOR, notifies the patient, and returns the refreshed thread', async () => {
      const doctor = buildDoctor({ id: 'doctor-1', user: { firstName: 'Greta', lastName: 'House', email: 'g@example.com' } });
      prisma.doctor.findUnique.mockResolvedValue(doctor);
      prisma.appointment.findFirst.mockResolvedValue(buildAppointment());
      prisma.chatMessage.findFirst.mockResolvedValue(null);
      prisma.chatMessage.create.mockResolvedValue(buildChatMessage({ sender: 'DOCTOR', body: 'hi' }));
      prisma.chatMessage.findMany.mockResolvedValue([buildChatMessage({ sender: 'DOCTOR', body: 'hi' })]);

      const result = await service.sendMessage('user-1', 'patient-1', 'hi');

      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: { patientId: 'patient-1', doctorId: 'doctor-1', sender: 'DOCTOR', body: 'hi' },
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.CHAT_MESSAGE,
        'New message from Dr. Greta House',
        'hi',
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ sender: 'doctor', body: 'hi' });
    });
  });

  describe('listPatientMedicalRecords', () => {
    it('throws NotFoundException when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.listPatientMedicalRecords('user-1', 'patient-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(medicalRecordsService.listForPatientByDoctor).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the patient is not in the inbox', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(service.listPatientMedicalRecords('user-1', 'patient-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(medicalRecordsService.listForPatientByDoctor).not.toHaveBeenCalled();
    });

    it("delegates to MedicalRecordsService, scoped to the calling doctor's own id", async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(buildAppointment());
      prisma.chatMessage.findFirst.mockResolvedValue(null);
      const records = [{ id: 'record-1' }];
      medicalRecordsService.listForPatientByDoctor.mockResolvedValue(records);

      const result = await service.listPatientMedicalRecords('user-1', 'patient-1');

      expect(medicalRecordsService.listForPatientByDoctor).toHaveBeenCalledWith('doctor-1', 'patient-1');
      expect(result).toBe(records);
    });
  });

  describe('addMedicalRecord', () => {
    const dto: CreateMedicalRecordDto = { diagnosis: 'Flu', notes: 'Rest and fluids' };

    it('throws NotFoundException when the calling user has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.addMedicalRecord('user-1', 'patient-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(medicalRecordsService.createForPatient).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the patient is not in the inbox', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor({ id: 'doctor-1' }));
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(service.addMedicalRecord('user-1', 'patient-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(medicalRecordsService.createForPatient).not.toHaveBeenCalled();
    });

    it('creates the record via MedicalRecordsService and notifies the patient', async () => {
      const doctor = buildDoctor({ id: 'doctor-1', user: { firstName: 'Greta', lastName: 'House', email: 'g@example.com' } });
      prisma.doctor.findUnique.mockResolvedValue(doctor);
      prisma.appointment.findFirst.mockResolvedValue(buildAppointment());
      prisma.chatMessage.findFirst.mockResolvedValue(null);
      const record = { id: 'record-1', diagnosis: 'Flu' };
      medicalRecordsService.createForPatient.mockResolvedValue(record);

      const result = await service.addMedicalRecord('user-1', 'patient-1', dto);

      expect(medicalRecordsService.createForPatient).toHaveBeenCalledWith('doctor-1', 'patient-1', dto);
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        NotificationType.MEDICAL_RECORD_ADDED,
        'New medical record added',
        expect.stringContaining('Dr. Greta House added a new diagnosis'),
      );
      expect(result).toBe(record);
    });
  });
});
