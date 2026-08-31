import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toClientMode } from '../common/session.mapper';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How far ahead of an appointment the reminder goes out. */
const REMINDER_LEAD_HOURS = 24;

const REMINDER_INCLUDE = {
  patient: { select: { id: true, email: true, firstName: true, lastName: true } },
  doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
} as const;

/**
 * Periodically reminds patients about an appointment coming up within
 * REMINDER_LEAD_HOURS. reminderSentAt gates each appointment to a single
 * reminder regardless of how often the cron fires.
 */
@Injectable()
export class AppointmentRemindersService {
  private readonly logger = new Logger(AppointmentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleDueReminders(): Promise<void> {
    await this.sendDueReminders();
  }

  async sendDueReminders(): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_LEAD_HOURS * 60 * 60 * 1000);

    const dueAppointments = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        reminderSentAt: null,
        scheduledAt: { gt: now, lte: windowEnd },
      },
      include: REMINDER_INCLUDE,
    });

    let sent = 0;
    for (const appointment of dueAppointments) {
      try {
        const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim();
        const doctorName = `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim();

        await this.emailService.sendAppointmentReminderEmail(appointment.patient.email, {
          patientName,
          doctorName,
          scheduledAt: appointment.scheduledAt,
          mode: toClientMode(appointment.mode),
        });

        await this.notificationsService.create(
          appointment.patient.id,
          NotificationType.APPOINTMENT_REMINDER,
          'Upcoming appointment reminder',
          `You have an appointment with Dr. ${doctorName} on ${appointment.scheduledAt.toLocaleString()}.`,
          `/my-appointments?appointmentId=${appointment.id}`,
        );

        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSentAt: new Date() },
        });

        sent += 1;
      } catch (error) {
        this.logger.error(`Failed to send reminder for appointment ${appointment.id}: ${(error as Error).message}`);
      }
    }

    return sent;
  }
}
