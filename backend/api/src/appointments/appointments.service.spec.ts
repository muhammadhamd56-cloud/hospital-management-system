import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, AppointmentMode, AppointmentStatus, NotificationType, Prisma, Role, type Appointment, type Doctor, type User } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import type { BookAppointmentDto } from './dto/book-appointment.dto';
import type { AppointmentWithDoctorAndPatient } from './appointment.mapper';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const doctorCaller: AuthenticatedUser = { id: 'doctor-user-1', email: 'doc@example.com', role: Role.DOCTOR };

/** A doctor row as book() loads it -- with the linked user's approval status. */
function bookableDoctor(overrides: Partial<Doctor> = {}, approvalStatus: ApprovalStatus = ApprovalStatus.APPROVED) {
  return { ...buildDoctor(overrides), user: { approvalStatus } };
}

function buildDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'doctor-1',
    specialization: 'Cardiology',
    qualifications: null,
    bio: 'Heart stuff',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    consultationFee: 0,
    appointmentDurationMinutes: 30,
    socialLinks: null,
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
    consultationFee: 0,
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
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
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
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodeHashes: [],
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    mfaChallengeId: null,
    approvalStatus: ApprovalStatus.APPROVED,
    approvalReviewedAt: null,
    approvalNote: null,
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
    $transaction: jest.Mock;
  };
  let notificationsService: { create: jest.Mock };
  let billingService: {
    createConsultationInvoiceInTx: jest.Mock;
    notifyConsultationInvoiceCreated: jest.Mock;
    cancelInvoiceForAppointment: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      appointment: {
        // Default: no overlapping-session candidates.
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      doctor: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };
    billingService = {
      createConsultationInvoiceInTx: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      notifyConsultationInvoiceCreated: jest.fn().mockResolvedValue(undefined),
      cancelInvoiceForAppointment: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: BillingService, useValue: billingService },
      ],
    }).compile();

    service = module.get(AppointmentsService);
  });

  describe('findAllForAdmin', () => {
    it('returns every appointment for an admin caller, mapped to the admin response shape', async () => {
      const appointment = buildAppointmentWithDoctorAndPatient();
      prisma.appointment.findMany.mockResolvedValue([appointment]);

      const result = await service.findAllForAdmin(admin);

      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: {},
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
          consultationFee: 0,
        },
      ]);
    });

    it('returns an empty array when there are no appointments', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      const result = await service.findAllForAdmin(admin);

      expect(result).toEqual([]);
    });

    it('scopes a doctor caller to only their own appointments', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ id: 'doctor-1', userId: 'doctor-user-1' }));
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findAllForAdmin(doctorCaller);

      expect(prisma.doctor.findUnique).toHaveBeenCalledWith({ where: { userId: 'doctor-user-1' } });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 'doctor-1' } }),
      );
    });

    it('returns an empty array without querying appointments when the doctor has no linked profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAllForAdmin(doctorCaller)).resolves.toEqual([]);
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
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
          consultationFee: 0,
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
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: 'not-a-date' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scheduledAt is in the past', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: '2000-01-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scheduledAt is exactly now', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
      const now = new Date('2026-06-01T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: now.toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException);

      jest.useRealTimers();
    });

    it('throws ConflictException when the doctor already has a scheduled appointment at that time', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
      prisma.appointment.findMany.mockResolvedValueOnce([
        { scheduledAt: new Date('2099-01-01T10:00:00.000Z'), doctor: { appointmentDurationMinutes: 30 } },
      ]);

      await expect(service.book('patient-1', dto)).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: {
          doctorId: 'doctor-1',
          status: AppointmentStatus.SCHEDULED,
          // Anything that started up to the longest session length (240 min)
          // before 10:00, up to this 30-minute session's end.
          scheduledAt: { gt: new Date('2099-01-01T06:00:00.000Z'), lt: new Date('2099-01-01T10:30:00.000Z') },
        },
        select: { scheduledAt: true, doctor: { select: { appointmentDurationMinutes: true } } },
      });
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it("rejects a session that overlaps the doctor's existing one without starting at the same instant", async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ appointmentDurationMinutes: 30 }));
      // First findMany = doctor overlap check; the 10:00 session overlaps 10:05.
      prisma.appointment.findMany
        .mockResolvedValueOnce([
          { scheduledAt: new Date('2099-01-01T10:00:00.000Z'), doctor: { appointmentDurationMinutes: 30 } },
        ])
        .mockResolvedValueOnce([]);

      await expect(
        service.book('patient-1', { ...dto, scheduledAt: '2099-01-01T10:05:00.000Z' }),
      ).rejects.toThrow('This doctor already has an appointment at that time');
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rejects a booking that overlaps one of the patient\'s own sessions with another doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
      prisma.appointment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { scheduledAt: new Date('2099-01-01T10:00:00.000Z'), doctor: { appointmentDurationMinutes: 30 } },
        ]);

      await expect(service.book('patient-1', dto)).rejects.toThrow('You already have another appointment at that time');
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it("uses the existing session's own length: a 60-min visit at 9:30 still blocks a 15-min one at 10:00", async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ appointmentDurationMinutes: 15 }));
      prisma.appointment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { scheduledAt: new Date('2099-01-01T09:30:00.000Z'), doctor: { appointmentDurationMinutes: 60 } },
        ]);

      await expect(service.book('patient-1', dto)).rejects.toThrow('You already have another appointment at that time');
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('allows a session that starts exactly when an earlier one ends', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
      prisma.appointment.findMany
        .mockResolvedValueOnce([
          { scheduledAt: new Date('2099-01-01T09:30:00.000Z'), doctor: { appointmentDurationMinutes: 30 } },
        ])
        .mockResolvedValueOnce([]);
      prisma.appointment.create.mockResolvedValue(buildAppointmentWithDoctorAndPatient());

      await service.book('patient-1', dto);
      expect(prisma.appointment.create).toHaveBeenCalled();
    });

    it('refuses to book a doctor who has marked themselves unavailable', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ isAvailable: false }));

      await expect(service.book('patient-1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('refuses an online booking with a doctor who only sees patients in person', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ acceptsOnline: false }));

      await expect(service.book('patient-1', { ...dto, mode: 'online' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('creates the appointment, converts the client mode to the Prisma enum, and notifies the doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
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
          consultationFee: 0,
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
        `/appointments?appointmentId=${created.id}`,
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
        consultationFee: 0,
      });

      expect(billingService.createConsultationInvoiceInTx).not.toHaveBeenCalled();
      expect(billingService.notifyConsultationInvoiceCreated).not.toHaveBeenCalled();
    });

    it('creates a consultation invoice when the doctor charges a fee', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ consultationFee: 150 }));
      const created = buildAppointmentWithDoctorAndPatient({
        scheduledAt: new Date('2099-01-01T10:00:00.000Z'),
        consultationFee: 150,
      });
      prisma.appointment.create.mockResolvedValue(created);

      await service.book('patient-1', dto);

      // Written through the booking's own transaction client...
      expect(billingService.createConsultationInvoiceInTx).toHaveBeenCalledWith(
        prisma,
        'patient-1',
        'Grace Hopper',
        150,
        created.scheduledAt,
        created.id,
      );
      // ...and announced only once that transaction has committed.
      expect(billingService.notifyConsultationInvoiceCreated).toHaveBeenCalledWith({ id: 'inv-1' });
    });

    it('creates the appointment and its invoice in one Serializable transaction', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ consultationFee: 150 }));
      const created = buildAppointmentWithDoctorAndPatient({ consultationFee: 150 });
      const tx = {
        appointment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(created) },
      };
      prisma.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(tx));

      await service.book('patient-1', dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(tx.appointment.create).toHaveBeenCalledTimes(1);
      expect(billingService.createConsultationInvoiceInTx).toHaveBeenCalledWith(
        tx,
        'patient-1',
        'Grace Hopper',
        150,
        created.scheduledAt,
        created.id,
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rolls the appointment back when creating its invoice fails, with no compensating delete or notifications', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ consultationFee: 150 }));
      const created = buildAppointmentWithDoctorAndPatient({ consultationFee: 150 });
      // A fake database: rows written inside the transaction are only kept if
      // the callback resolves, like a real COMMIT/ROLLBACK.
      const committed: unknown[] = [];
      prisma.$transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
        const staged: unknown[] = [];
        const tx = {
          appointment: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn(async () => {
              staged.push(created);
              return created;
            }),
          },
        };
        const result = await fn(tx);
        committed.push(...staged);
        return result;
      });
      billingService.createConsultationInvoiceInTx.mockRejectedValue(new Error('invoice insert failed'));
      const appointmentDelete = jest.fn();
      (prisma.appointment as unknown as { delete: jest.Mock }).delete = appointmentDelete;

      await expect(service.book('patient-1', dto)).rejects.toThrow('invoice insert failed');

      expect(committed).toEqual([]);
      expect(appointmentDelete).not.toHaveBeenCalled();
      expect(billingService.notifyConsultationInvoiceCreated).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('maps a serialization failure on the booking+invoice transaction to a ConflictException', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ consultationFee: 150 }));
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('could not serialize access', { code: 'P2034', clientVersion: 'test' }),
      );

      await expect(service.book('patient-1', dto)).rejects.toBeInstanceOf(ConflictException);
      expect(billingService.notifyConsultationInvoiceCreated).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('does not create a consultation invoice when the doctor has no fee set', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor({ consultationFee: 0 }));
      prisma.appointment.create.mockResolvedValue(buildAppointmentWithDoctorAndPatient());

      await service.book('patient-1', dto);

      expect(billingService.createConsultationInvoiceInTx).not.toHaveBeenCalled();
      expect(billingService.notifyConsultationInvoiceCreated).not.toHaveBeenCalled();
    });

    it('maps an in-person mode to the Prisma IN_PERSON enum value', async () => {
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
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
      prisma.doctor.findUnique.mockResolvedValue(bookableDoctor());
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
    const FUTURE = new Date('2099-01-01T10:00:00.000Z');

    it('refuses to cancel a session whose start time has already passed (it may have happened)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        buildAppointment({ patientId: 'patient-1', scheduledAt: new Date('2000-01-01T10:00:00.000Z') }),
      );

      await expect(service.cancel('patient-1', 'appt-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(billingService.cancelInvoiceForAppointment).not.toHaveBeenCalled();
    });

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

    it.each([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED])(
      'refuses to cancel a %s appointment, leaving its invoice alone',
      async (status) => {
        prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ patientId: 'patient-1', status }));

        await expect(service.cancel('patient-1', 'appt-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.appointment.update).not.toHaveBeenCalled();
        expect(billingService.cancelInvoiceForAppointment).not.toHaveBeenCalled();
      },
    );

    it('409s when the doctor completed the session between the check and the write', async () => {
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ patientId: 'patient-1', scheduledAt: FUTURE }));
      prisma.appointment.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }),
      );

      await expect(service.cancel('patient-1', 'appt-1')).rejects.toBeInstanceOf(ConflictException);
      expect(billingService.cancelInvoiceForAppointment).not.toHaveBeenCalled();
    });

    it('cancels the appointment and notifies the doctor', async () => {
      prisma.appointment.findUnique.mockResolvedValue(buildAppointment({ patientId: 'patient-1', scheduledAt: FUTURE }));
      const updated = buildAppointmentWithDoctorAndPatient({
        patientId: 'patient-1',
        status: AppointmentStatus.CANCELLED,
      });
      prisma.appointment.update.mockResolvedValue(updated);

      const result = await service.cancel('patient-1', 'appt-1');

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: AppointmentStatus.SCHEDULED },
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
        '/appointments?appointmentId=appt-1',
      );

      expect(billingService.cancelInvoiceForAppointment).toHaveBeenCalledWith('appt-1');
      expect(result.status).toBe('cancelled');
    });
  });
});
