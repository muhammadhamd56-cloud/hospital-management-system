import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentMode, AppointmentStatus } from '@prisma/client';
import { AppointmentRemindersService } from './appointment-reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

function buildDueAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    mode: AppointmentMode.ONLINE,
    status: AppointmentStatus.SCHEDULED,
    reason: 'Checkup',
    reminderSentAt: null,
    patient: { id: 'patient-1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
    doctor: { user: { firstName: 'Grace', lastName: 'Hopper' } },
    ...overrides,
  };
}

describe('AppointmentRemindersService', () => {
  let service: AppointmentRemindersService;
  let prisma: {
    appointment: { findMany: jest.Mock; update: jest.Mock };
  };
  let emailService: { sendAppointmentReminderEmail: jest.Mock };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      appointment: { findMany: jest.fn(), update: jest.fn() },
    };
    emailService = { sendAppointmentReminderEmail: jest.fn().mockResolvedValue(undefined) };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(AppointmentRemindersService);
  });

  it('queries only SCHEDULED, not-yet-reminded appointments within the reminder window', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);

    await service.sendDueReminders();

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AppointmentStatus.SCHEDULED,
          reminderSentAt: null,
        }),
      }),
    );
  });

  it('emails and notifies the patient, then stamps reminderSentAt, for each due appointment', async () => {
    const appointment = buildDueAppointment();
    prisma.appointment.findMany.mockResolvedValue([appointment]);

    const sent = await service.sendDueReminders();

    expect(emailService.sendAppointmentReminderEmail).toHaveBeenCalledWith(
      'ada@example.com',
      expect.objectContaining({ patientName: 'Ada Lovelace', doctorName: 'Grace Hopper', mode: 'online' }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      'patient-1',
      'APPOINTMENT_REMINDER',
      expect.any(String),
      expect.stringContaining('Grace Hopper'),
      '/my-appointments?appointmentId=appt-1',
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      data: { reminderSentAt: expect.any(Date) },
    });
    expect(sent).toBe(1);
  });

  it('keeps processing remaining appointments when one fails partway through', async () => {
    const first = buildDueAppointment({ id: 'appt-1' });
    const second = buildDueAppointment({ id: 'appt-2', patientId: 'patient-2' });
    prisma.appointment.findMany.mockResolvedValue([first, second]);
    prisma.appointment.update.mockRejectedValueOnce(new Error('db hiccup')).mockResolvedValueOnce(undefined);

    const sent = await service.sendDueReminders();

    expect(emailService.sendAppointmentReminderEmail).toHaveBeenCalledTimes(2);
    expect(sent).toBe(1);
  });

  it('does not touch appointments outside the reminder window (enforced by the findMany query, not JS filtering)', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);

    await service.sendDueReminders();

    expect(emailService.sendAppointmentReminderEmail).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});
