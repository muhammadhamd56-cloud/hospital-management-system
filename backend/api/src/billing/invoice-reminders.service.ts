import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toInvoiceResponse } from './billing.service';

const OVERDUE_INVOICE_INCLUDE = {
  patient: { select: { id: true, email: true, firstName: true, lastName: true } },
  items: true,
  payments: { include: { recordedBy: { select: { firstName: true, lastName: true } }, refunds: true } },
} as const;

/**
 * Periodically notifies a patient the one time their invoice becomes
 * overdue. overdueNotifiedAt gates each invoice to a single notice
 * regardless of how often the cron fires -- same one-time-event pattern as
 * StaffScheduling's TaskRemindersService.sendOverdueNotices(), which this
 * mirrors structurally.
 */
@Injectable()
export class InvoiceRemindersService {
  private readonly logger = new Logger(InvoiceRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleOverdueInvoices(): Promise<void> {
    await this.sendOverdueNotices();
  }

  async sendOverdueNotices(): Promise<number> {
    const now = new Date();

    const candidates = await this.prisma.invoice.findMany({
      where: {
        status: { not: InvoiceStatus.CANCELLED },
        overdueNotifiedAt: null,
        dueDate: { lt: now },
      },
      include: OVERDUE_INVOICE_INCLUDE,
    });

    let sent = 0;
    for (const invoice of candidates) {
      try {
        // toInvoiceResponse is the one place "overdue" and "remaining" are
        // derived -- re-checking here rather than trusting the where-clause
        // alone catches an invoice that's technically past its dueDate but
        // was just fully paid/refunded back to 0 since the last run.
        const response = toInvoiceResponse(invoice);

        if (response.status !== 'overdue') {
          continue;
        }

        const patientName = `${invoice.patient.firstName} ${invoice.patient.lastName}`.trim();

        await this.emailService.sendInvoiceOverdueEmail(invoice.patient.email, {
          patientName,
          invoiceNumber: response.invoiceNumber,
          amount: response.remaining,
          dueDate: invoice.dueDate,
        });

        await this.notificationsService.create(
          invoice.patient.id,
          NotificationType.INVOICE_OVERDUE,
          'Invoice overdue',
          `Invoice ${response.invoiceNumber} for ${response.remaining.toFixed(2)} is overdue.`,
          `/billing?invoiceId=${invoice.id}`,
        );

        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { overdueNotifiedAt: new Date() },
        });

        sent += 1;
      } catch (error) {
        this.logger.error(`Failed to send overdue reminder for invoice ${invoice.id}: ${(error as Error).message}`);
      }
    }

    return sent;
  }
}
