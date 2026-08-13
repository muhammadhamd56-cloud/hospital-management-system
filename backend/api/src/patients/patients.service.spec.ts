import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AppointmentMode, AppointmentStatus, Role } from '@prisma/client';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const doctorCaller: AuthenticatedUser = { id: 'doctor-user-1', email: 'doc@example.com', role: Role.DOCTOR };

function buildPatientListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'patient-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    picture: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    appointments: [] as { scheduledAt: Date }[],
    _count: { appointments: 0 },
    ...overrides,
  };
}

function buildAppointmentWithDoctor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    scheduledAt: new Date('2026-02-01T10:00:00.000Z'),
    mode: AppointmentMode.ONLINE,
    status: AppointmentStatus.SCHEDULED,
    reason: 'Checkup',
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    updatedAt: new Date('2026-01-15T00:00:00.000Z'),
    doctor: {
      specialization: 'Cardiology',
      user: { firstName: 'Grace', lastName: 'Hopper' },
      department: { name: 'Cardiology' },
    },
    ...overrides,
  };
}

function buildPatientDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'patient-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    picture: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    appointments: [] as ReturnType<typeof buildAppointmentWithDoctor>[],
    ...overrides,
  };
}

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: {
    user: { findMany: jest.Mock; findFirst: jest.Mock };
    doctor: { findUnique: jest.Mock };
    appointment: { findMany: jest.Mock; findFirst: jest.Mock };
    chatMessage: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), findFirst: jest.fn() },
      doctor: { findUnique: jest.fn() },
      appointment: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PatientsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PatientsService);
  });

  describe('findAll', () => {
    it('queries every PATIENT-role user, unfiltered, for an admin caller', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAll(admin);

      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.PATIENT },
        orderBy: { createdAt: 'desc' },
        include: {
          appointments: { select: { scheduledAt: true }, orderBy: { scheduledAt: 'desc' }, take: 1 },
          _count: { select: { appointments: true } },
        },
      });
    });

    it('returns an empty array when there are no patients', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.findAll(admin)).resolves.toEqual([]);
    });

    it('maps a patient with no appointments to appointmentCount 0 and lastVisit null', async () => {
      const row = buildPatientListRow({ appointments: [], _count: { appointments: 0 } });
      prisma.user.findMany.mockResolvedValue([row]);

      const result = await service.findAll(admin);

      expect(result).toEqual([
        {
          id: 'patient-1',
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
          picture: null,
          joinedAt: row.createdAt.toISOString(),
          appointmentCount: 0,
          lastVisit: null,
        },
      ]);
    });

    it('maps a patient with appointments to their most recent scheduledAt and total count', async () => {
      const scheduledAt = new Date('2026-02-10T09:30:00.000Z');
      const row = buildPatientListRow({
        appointments: [{ scheduledAt }],
        _count: { appointments: 4 },
      });
      prisma.user.findMany.mockResolvedValue([row]);

      const result = await service.findAll(admin);

      expect(result[0].appointmentCount).toBe(4);
      expect(result[0].lastVisit).toBe(scheduledAt.toISOString());
    });

    it('trims whitespace when joining first and last name', async () => {
      const row = buildPatientListRow({ firstName: 'Ada', lastName: '' });
      prisma.user.findMany.mockResolvedValue([row]);

      const result = await service.findAll(admin);

      expect(result[0].fullName).toBe('Ada');
    });

    it('scopes a doctor caller to only patients they have an appointment or chat relationship with', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1' });
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'patient-1' }]);
      prisma.chatMessage.findMany.mockResolvedValue([{ patientId: 'patient-2' }]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAll(doctorCaller);

      expect(prisma.doctor.findUnique).toHaveBeenCalledWith({ where: { userId: 'doctor-user-1' } });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: { doctorId: 'doctor-1' },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.PATIENT, id: { in: expect.arrayContaining(['patient-1', 'patient-2']) } },
        orderBy: { createdAt: 'desc' },
        include: {
          appointments: { select: { scheduledAt: true }, orderBy: { scheduledAt: 'desc' }, take: 1 },
          _count: { select: { appointments: true } },
        },
      });
    });

    it('returns an empty array without querying users when the doctor caller has no relationships', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1' });
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.chatMessage.findMany.mockResolvedValue([]);

      const result = await service.findAll(doctorCaller);

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array without querying users when the doctor caller has no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      const result = await service.findAll(doctorCaller);

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when no patient with that id exists (admin caller)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('queries by id scoped to role PATIENT, including appointments with doctor/department detail', async () => {
      prisma.user.findFirst.mockResolvedValue(buildPatientDetailRow());

      await service.findOne(admin, 'patient-1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'patient-1', role: Role.PATIENT },
        include: {
          appointments: {
            include: {
              doctor: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                  department: { select: { name: true } },
                },
              },
            },
            orderBy: { scheduledAt: 'desc' },
          },
        },
      });
    });

    it('returns patient detail with an empty appointments array and lastVisit null when there are none', async () => {
      const row = buildPatientDetailRow({ appointments: [] });
      prisma.user.findFirst.mockResolvedValue(row);

      const result = await service.findOne(admin, 'patient-1');

      expect(result).toEqual({
        id: 'patient-1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        picture: null,
        joinedAt: row.createdAt.toISOString(),
        appointmentCount: 0,
        lastVisit: null,
        appointments: [],
      });
    });

    it('maps appointments to PatientAppointmentResponse and derives lastVisit/appointmentCount from them', async () => {
      const appointment = buildAppointmentWithDoctor({
        id: 'appt-1',
        doctorId: 'doctor-1',
        scheduledAt: new Date('2026-03-01T12:00:00.000Z'),
        mode: AppointmentMode.IN_PERSON,
        status: AppointmentStatus.COMPLETED,
        reason: 'Follow-up',
      });
      const row = buildPatientDetailRow({ appointments: [appointment] });
      prisma.user.findFirst.mockResolvedValue(row);

      const result = await service.findOne(admin, 'patient-1');

      expect(result.appointmentCount).toBe(1);
      expect(result.lastVisit).toBe(appointment.scheduledAt.toISOString());
      expect(result.appointments).toEqual([
        {
          id: 'appt-1',
          doctorId: 'doctor-1',
          doctorName: 'Grace Hopper',
          specialization: 'Cardiology',
          department: 'Cardiology',
          scheduledAt: appointment.scheduledAt.toISOString(),
          mode: 'in-person',
          status: 'completed',
          reason: 'Follow-up',
        },
      ]);
    });

    it('trims whitespace when joining first and last name', async () => {
      const row = buildPatientDetailRow({ firstName: 'Ada', lastName: '' });
      prisma.user.findFirst.mockResolvedValue(row);

      const result = await service.findOne(admin, 'patient-1');

      expect(result.fullName).toBe('Ada');
    });

    it('allows a doctor caller to fetch a patient they have an appointment with', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1' });
      prisma.appointment.findFirst.mockResolvedValue(buildAppointmentWithDoctor());
      prisma.user.findFirst.mockResolvedValue(buildPatientDetailRow());

      await expect(service.findOne(doctorCaller, 'patient-1')).resolves.toBeDefined();

      expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
        where: { doctorId: 'doctor-1', patientId: 'patient-1' },
      });
    });

    it('allows a doctor caller to fetch a patient they only have a chat relationship with', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1' });
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue({ id: 'msg-1' });
      prisma.user.findFirst.mockResolvedValue(buildPatientDetailRow());

      await expect(service.findOne(doctorCaller, 'patient-1')).resolves.toBeDefined();
    });

    it('throws NotFoundException for a doctor caller with no relationship to the patient, without querying the patient row', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1' });
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(service.findOne(doctorCaller, 'patient-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a doctor caller with no linked doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findOne(doctorCaller, 'patient-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
