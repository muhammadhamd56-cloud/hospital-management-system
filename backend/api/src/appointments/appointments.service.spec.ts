import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentMode, AppointmentStatus, NotificationType, Role, type Appointment, type Doctor, type User } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { BookAppointmentDto } from './dto/book-appointment.dto';
import type { AppointmentWithDoctorAndPatient } from './appointment.mapper';

function buildDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'doctor-1',
    specialization: 'Cardiology',
    bio: 'Heart stuff',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'doctor-user-1',
    departmentId: 'dept-1',
    ...overrides,
  };
}

function buildAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
    mode: AppointmentMode.ONLINE,
    status: AppointmentStatus.SCHEDULED,
    reason: 'Checkup',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    reminderSentAt: null,
    ...overrides,
  };
}

function buildPatientUser(overrides: Partial<User> = {}): User {
  return {
    id: 'patient-1',
    googleId: null,
    email: 'ada@example.com',
    password: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: null,
    picture: null,
    role: Role.PATIENT,
    roleSelected: true,
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

function buildAppointmentWithDoctorAndPatient(
  overrides: Partial<Appointment> = {},
): AppointmentWithDoctorAndPatient {
  return {
    ...buildAppointment(overrides),
    doctor: {
      ...buildDoctor(),
      user: { firstName: 'Grace', lastName: 'Hopper' },
      department: { name: 'Cardiology' },
    },
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
  } as AppointmentWithDoctorAndPatient;
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: {
    appointment: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    doctor: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      appointment: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      doctor: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(AppointmentsService);
  });

  describe('findAllForAdmin', () => {
    it('returns all appointments mapped to the admin response shape, ordered by scheduledAt', async () => {
      const appointment = buildAppointmentWithDoctorAndPatient();
      prisma.appointment.findMany.mockResolvedValue([appointment]);

      const result = await service.findAllForAdmin();

      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        include: {
          doctor: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
            },
          },
          patient: { select: { firstName: true, lastName: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'appt-1',
          patientName: 'Ada Lovelace',
          doctorName: 'Grace Hopper',
          specialization: 'Cardiology',
          department: 'Cardiology',
          scheduledAt: appointment.scheduledAt.toISOString(),
          mode: 'online',
          status: 'scheduled',
          reason: 'Checkup',
        },
      ]);
    });

    it('returns an empty array when there are no appointments', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      const result = await service.findAllForAdmin();

      expect(result).toEqual([]);
    });
  });

  describe('listMine', () => {
    it('returns only the given patient\'s appointments, mapped to the patient response shape', async () => {
      const appointment = buildAppointmentWithDoctorAndPatient();
      prisma.appointment.findMany.mockResolvedValue([appointment]);

      const result = await service.listMine('patient-1');

      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: { patientId: 'patient-1' },
        include: {
          doctor: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'appt-1',
          doctorId: 'doctor-1',
          doctorName: 'Grace Hopper',
          specialization: 'Cardiology',
          department: 'Cardiology',
          scheduledAt: appointment.scheduledAt.toISOString(),
          mode: 'online',
          status: 'scheduled',
          reason: 'Checkup',
        },
      ]);
    });
  });

  describe('book', () => {
    const dto: BookAppointmentDto = {
      doctorId: 'doctor-1',
      scheduledAt: '2099-01-01T10:00:00.000Z',
      mode: 'online',
      reason: 'Follow-up',
    };

    it('throws NotFoundException when the doctor does not exist', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.book('patient-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scheduledAt is not a valid date', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: 'not-a-date' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scheduledAt is in the past', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: '2000-01-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scheduledAt is exactly now', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      const now = new Date('2026-06-01T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: now.toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException);

      jest.useRealTimers();
    });

    it('throws ConflictException when the doctor already has a scheduled appointment at that time', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.findFirst.mockResolvedValue(buildAppointment());

      await expect(service.book('patient-1', dto)).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
        where: {
          doctorId: 'doctor-1',
          scheduledAt: new Date(dto.scheduledAt),
          status: AppointmentStatus.SCHEDULED,
        },
      });
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('creates the appointment, converts the client mode to the Prisma enum, and notifies the doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      const created = buildAppointmentWithDoctorAndPatient({
        scheduledAt: new Date('2099-01-01T10:00:00.000Z'),
        mode: AppointmentMode.ONLINE,
        reason: 'Follow-up',
      });
      prisma.appointment.create.mockResolvedValue(created);

      const result = await service.book('patient-1', dto);

      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: {
          patientId: 'patient-1',
          doctorId: 'doctor-1',
          scheduledAt: new Date(dto.scheduledAt),
          mode: AppointmentMode.ONLINE,
          reason: 'Follow-up',
        },
        include: {
          doctor: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
            },
          },
          patient: { select: { firstName: true, lastName: true } },
        },
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        created.doctor.userId,
        NotificationType.APPOINTMENT_BOOKED,
        'New appointment booked',
        expect.stringContaining('Ada Lovelace'),
      );

      expect(result).toEqual({
        id: created.id,
        doctorId: 'doctor-1',
        doctorName: 'Grace Hopper',
        specialization: 'Cardiology',
        department: 'Cardiology',
        scheduledAt: created.scheduledAt.toISOString(),
        mode: 'online',
        status: 'scheduled',
        reason: 'Follow-up',
      });
    });

    it('maps an in-person mode to the Prisma IN_PERSON enum value', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.create.mockResolvedValue(
        buildAppointmentWithDoctorAndPatient({ mode: AppointmentMode.IN_PERSON }),
      );

      await service.book('patient-1', { ...dto, mode: 'in-person' });

      const createArgs = prisma.appointment.create.mock.calls[0][0];
      expect(createArgs.data.mode).toBe(AppointmentMode.IN_PERSON);
    });
  });

  describe('bookForPatient', () => {
    const dto: BookAppointmentDto = {
      doctorId: 'doctor-1',
      scheduledAt: '2099-01-01T10:00:00.000Z',
      mode: 'online',
      reason: 'Front-desk booking',
    };

    it('throws BadRequestException when the patient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.bookForPatient('patient-1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the given id belongs to a non-patient account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatientUser({ role: Role.DOCTOR }));

      await expect(service.bookForPatient('patient-1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('books the appointment for the given patient once validated', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatientUser());
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      const created = buildAppointmentWithDoctorAndPatient({
        scheduledAt: new Date('2099-01-01T10:00:00.000Z'),
        mode: AppointmentMode.ONLINE,
        reason: 'Front-desk booking',
      });
      prisma.appointment.create.mockResolvedValue(created);

      const result = await service.bookForPatient('patient-1', dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'patient-1' } });
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ patientId: 'patient-1' }) }),
      );
      expect(result.id).toBe(created.id);
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when the appointment does not exist', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.cancel('patient-1', 'appt-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the appointment belongs to a different patient', async () => {
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ patientId: 'someone-else' }));

      await expect(service.cancel('patient-1', 'appt-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('cancels the appointment and notifies the doctor', async () => {
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ patientId: 'patient-1' }));
      const updated = buildAppointmentWithDoctorAndPatient({
        patientId: 'patient-1',
        status: AppointmentStatus.CANCELLED,
      });
      prisma.appointment.update.mockResolvedValue(updated);

      const result = await service.cancel('patient-1', 'appt-1');

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'CANCELLED' },
        include: {
          doctor: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
            },
          },
          patient: { select: { firstName: true, lastName: true } },
        },
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        updated.doctor.userId,
        NotificationType.APPOINTMENT_CANCELLED,
        'Appointment cancelled',
        expect.stringContaining('Ada Lovelace'),
      );

      expect(result.status).toBe('cancelled');
    });
  });
});
