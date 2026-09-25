import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  NotificationType,
  PaymentMethod,
  Prisma,
  Role,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type Refund,
  type User,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { roundMoney } from '../common/money.util';
import { currentMonthRange, lastCalendarMonths } from '../common/date-range.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { StripeService } from './stripe.service';
import { formatInvoiceNumber } from './invoice-number.util';

export interface InvoiceItemResponse {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface PaymentResponse {
  id: string;
  amount: number;
  method: PaymentMethod;
  recordedBy: string | null;
  createdAt: string;
  /** Sum of this payment's Refund rows -- 0 if never refunded. */
  refundedAmount: number;
  /** amount - refundedAmount, clamped at 0. What's left to refund. */
  refundableAmount: number;
}

export type InvoiceDisplayStatus =
  | 'paid'
  | 'pending'
  | 'partially_paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  description: string;
  /** Sum of line-item totals, before this invoice's own discount/tax. */
  subtotal: number;
  discount: number;
  tax: number;
  /** subtotal - discount + tax. */
  amount: number;
  amountPaid: number;
  remaining: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceDisplayStatus;
  items: InvoiceItemResponse[];
  payments: PaymentResponse[];
}

export interface BillingOverview {
  totalRevenue: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalInvoices: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export type InvoiceWithRelations = Invoice & {
  patient: Pick<User, 'firstName' | 'lastName'>;
  items: InvoiceItem[];
  payments: (Payment & { recordedBy: Pick<User, 'firstName' | 'lastName'> | null; refunds: Refund[] })[];
};


export function toInvoiceResponse(invoice: InvoiceWithRelations): InvoiceResponse {
  const subtotal = roundMoney(invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - item.discount), 0));
  const amount = roundMoney(subtotal - invoice.discount + invoice.tax);
  // Net of any refunds -- a payment that's been fully refunded no longer
  // counts toward what the patient has actually paid.
  const amountPaid = roundMoney(
    invoice.payments.reduce(
      (sum, payment) => sum + (payment.amount - payment.refunds.reduce((s, refund) => s + refund.amount, 0)),
      0,
    ),
  );
  const totalRefunded = roundMoney(
    invoice.payments.reduce((sum, payment) => sum + payment.refunds.reduce((s, refund) => s + refund.amount, 0), 0),
  );
  const remaining = roundMoney(Math.max(0, amount - amountPaid));
  const isPastDue = invoice.dueDate.getTime() < Date.now();

  let status: InvoiceDisplayStatus;
  if (invoice.status === InvoiceStatus.CANCELLED) {
    status = 'cancelled';
  } else if (totalRefunded > 0 && amountPaid <= 0.01) {
    status = 'refunded';
  } else if (totalRefunded > 0) {
    status = 'partially_refunded';
  } else if (remaining <= 0) {
    status = 'paid';
  } else if (isPastDue) {
    status = 'overdue';
  } else if (amountPaid > 0) {
    status = 'partially_paid';
  } else {
    status = 'pending';
  }

  return {
    id: invoice.id,
    invoiceNumber: formatInvoiceNumber(invoice.invoiceNumber),
    patientId: invoice.patientId,
    patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`.trim(),
    description: invoice.description,
    subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    amount,
    amountPaid,
    remaining,
    issueDate: invoice.createdAt.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    status,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      lineTotal: roundMoney(item.quantity * item.unitPrice - item.discount),
    })),
    payments: invoice.payments
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((payment) => {
        const refundedAmount = roundMoney(payment.refunds.reduce((sum, refund) => sum + refund.amount, 0));
        return {
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          recordedBy: payment.recordedBy ? `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`.trim() : null,
          createdAt: payment.createdAt.toISOString(),
          refundedAmount,
          refundableAmount: roundMoney(Math.max(0, payment.amount - refundedAmount)),
        };
      }),
  };
}

export const INVOICE_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  items: true,
  payments: { include: { recordedBy: { select: { firstName: true, lastName: true } }, refunds: true } },
} as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  /**
   * ADMIN sees every invoice. DOCTOR is scoped to patients they have a real
   * relationship with (an appointment or chat message) -- mirrors
   * PatientsService.scopedPatientIds() and LaboratoryService.scopedPatientWhere()
   * -- a doctor should only see billing for their own patients, not the
   * whole hospital's.
   */
  async findAll(caller: AuthenticatedUser): Promise<InvoiceResponse[]> {
    const where = caller.role === Role.DOCTOR ? await this.scopedPatientWhere(caller.id) : {};

    if (where === null) {
      return [];
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map(toInvoiceResponse);
  }

  async findMine(patientId: string): Promise<InvoiceResponse[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { patientId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map(toInvoiceResponse);
  }

  async findOne(caller: AuthenticatedUser, id: string): Promise<InvoiceResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (caller.role === Role.DOCTOR) {
      await this.assertOwnPatient(caller.id, invoice.patientId);
    } else if (caller.role === Role.PATIENT && invoice.patientId !== caller.id) {
      // Unreachable via BillingController today (GET /billing/invoices/:id is
      // ADMIN/DOCTOR-only there) -- guarded here too so this method stays
      // safe to call directly from other callers (e.g. AssistantService)
      // without silently trusting a patient-supplied id.
      throw new NotFoundException('Invoice not found');
    }

    return toInvoiceResponse(invoice);
  }

  /** Starts an online payment for the remaining balance on one of the caller's own invoices. */
  async createCheckoutSession(patientId: string, invoiceId: string): Promise<{ url: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE });

    if (!invoice || invoice.patientId !== patientId) {
      throw new NotFoundException('Invoice not found');
    }

    const response = toInvoiceResponse(invoice);

    if (response.status === 'cancelled') {
      throw new BadRequestException('This invoice has been cancelled');
    }

    if (response.remaining <= 0) {
      throw new BadRequestException('Invoice is already paid');
    }

    return this.stripeService.createCheckoutSession({
      id: invoice.id,
      description: invoice.description,
      amount: response.remaining,
    });
  }

  async create(caller: AuthenticatedUser, dto: CreateInvoiceDto): Promise<InvoiceResponse> {
    const patient = await this.prisma.user.findUnique({ where: { id: dto.patientId } });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new BadRequestException('Patient not found');
    }

    if (caller.role === Role.DOCTOR) {
      await this.assertOwnPatient(caller.id, dto.patientId);
    }

    const dueDate = new Date(dto.dueDate);

    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid due date');
    }

    const items = dto.items.map((item) => {
      const lineValue = item.quantity * item.unitPrice;
      const discount = item.discount ?? 0;

      if (discount > lineValue) {
        throw new BadRequestException(`Discount for "${item.description}" cannot exceed its line total`);
      }

      return { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discount };
    });

    const subtotal = roundMoney(items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - item.discount), 0));
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;

    if (discount > subtotal) {
      throw new BadRequestException('Invoice discount cannot exceed the subtotal');
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId: dto.patientId,
        description: dto.description,
        amount: subtotal,
        discount,
        tax,
        dueDate,
        items: { create: items },
      },
      include: INVOICE_INCLUDE,
    });

    const response = toInvoiceResponse(invoice);

    await this.auditLogService.log({
      actorId: caller.id,
      action: 'CREATE',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber: response.invoiceNumber, patientId: dto.patientId, amount: response.amount },
    });

    await this.notificationsService.create(
      dto.patientId,
      NotificationType.INVOICE_CREATED,
      `New invoice ${response.invoiceNumber}`,
      `You have a new invoice for ${response.amount.toFixed(2)}.`,
      `/billing?invoiceId=${invoice.id}`,
    );

    return response;
  }

  /** Records a full or partial payment against an invoice. Never allows paying more than the remaining balance. */
  async recordPayment(
    caller: AuthenticatedUser,
    id: string,
    dto: RecordPaymentDto,
    recordedById: string | null,
  ): Promise<InvoiceResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (caller.role === Role.DOCTOR) {
      await this.assertOwnPatient(caller.id, invoice.patientId);
    }

    const current = toInvoiceResponse(invoice);

    if (current.status === 'cancelled') {
      throw new BadRequestException('Cannot record a payment against a cancelled invoice');
    }

    if (current.remaining <= 0) {
      throw new BadRequestException('Invoice is already paid');
    }

    const amount = roundMoney(dto.amount);

    // A tiny epsilon tolerates rounding noise between the frontend's live total and this recompute.
    if (amount > current.remaining + 0.01) {
      throw new BadRequestException(
        `Payment of ${amount.toFixed(2)} exceeds the remaining balance of ${current.remaining.toFixed(2)}`,
      );
    }

    await this.prisma.payment.create({
      data: { invoiceId: id, amount, method: dto.method, recordedById },
    });

    const newAmountPaid = roundMoney(current.amountPaid + amount);
    const isFullyPaid = newAmountPaid >= current.amount - 0.01;

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
        paidAt: isFullyPaid ? new Date() : null,
      },
      include: INVOICE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: 'UPDATE',
      entityType: 'Invoice',
      entityId: id,
      metadata: { paymentAmount: amount, method: dto.method, resultingStatus: updated.status },
    });

    const response = toInvoiceResponse(updated);

    await this.notificationsService.create(
      invoice.patientId,
      NotificationType.PAYMENT_RECEIVED,
      'Payment received',
      `Payment of ${amount.toFixed(2)} received for Invoice ${response.invoiceNumber}.`,
      `/billing?invoiceId=${id}`,
    );

    return response;
  }

  /**
   * Full or partial reversal of one payment. Admin-only (see
   * BillingController) -- matches the precedent that "reverses money"
   * actions (cancel, revenue) are admin-only, unlike recordPayment which
   * DOCTOR can also do. For a payment taken via Stripe Checkout, actually
   * refunds it through Stripe; for a manually-recorded payment (cash/bank/
   * other, or a card payment taken outside Stripe), just records the
   * reversal -- there's nothing external to call. Keeps the stored
   * Invoice.status in sync afterward (same reasoning as recordPayment) so
   * other code that reads the raw column directly -- the cancel() guard,
   * the webhook's already-paid check -- stays correct.
   */
  async refundPayment(
    caller: AuthenticatedUser,
    invoiceId: string,
    paymentId: string,
    dto: RefundPaymentDto,
  ): Promise<InvoiceResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (caller.role === Role.DOCTOR) {
      await this.assertOwnPatient(caller.id, invoice.patientId);
    }

    const payment = invoice.payments.find((candidate) => candidate.id === paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found on this invoice');
    }

    const alreadyRefunded = roundMoney(payment.refunds.reduce((sum, refund) => sum + refund.amount, 0));
    const maxRefundable = roundMoney(Math.max(0, payment.amount - alreadyRefunded));

    if (maxRefundable <= 0) {
      throw new BadRequestException('This payment has already been fully refunded');
    }

    const amount = roundMoney(dto.amount ?? maxRefundable);

    if (amount > maxRefundable + 0.01) {
      throw new BadRequestException(
        `Refund of ${amount.toFixed(2)} exceeds the refundable balance of ${maxRefundable.toFixed(2)}`,
      );
    }

    let stripeRefundId: string | null = null;

    if (payment.stripePaymentIntentId) {
      const refund = await this.stripeService.refundPayment(payment.stripePaymentIntentId, Math.round(amount * 100));
      stripeRefundId = refund.id;
    }

    await this.prisma.refund.create({
      data: { paymentId: payment.id, amount, reason: dto.reason, stripeRefundId, refundedById: caller.id },
    });

    const updatedInvoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE,
    });
    const response = toInvoiceResponse(updatedInvoice);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status:
          response.remaining <= 0.01
            ? InvoiceStatus.PAID
            : response.amountPaid > 0.01
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.PENDING,
        paidAt: response.remaining <= 0.01 ? invoice.paidAt : null,
      },
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: 'UPDATE',
      entityType: 'Refund',
      entityId: payment.id,
      metadata: { invoiceId, amount, reason: dto.reason ?? null, stripeRefundId },
    });

    await this.notificationsService.create(
      invoice.patientId,
      NotificationType.PAYMENT_REFUNDED,
      'Payment refunded',
      `A refund of ${amount.toFixed(2)} was issued for Invoice ${response.invoiceNumber}.`,
      `/billing?invoiceId=${invoiceId}`,
    );

    return response;
  }

  /** Admin-only. Refuses to cancel an invoice that already has payments recorded -- refund first. */
  async cancel(caller: AuthenticatedUser, id: string): Promise<InvoiceResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is already cancelled');
    }

    if (invoice.payments.length > 0) {
      throw new BadRequestException('Cannot cancel an invoice that already has payments recorded');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
      include: INVOICE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: 'UPDATE',
      entityType: 'Invoice',
      entityId: id,
      metadata: { status: 'CANCELLED' },
    });

    return toInvoiceResponse(updated);
  }

  /**
   * The ONE authoritative revenue aggregation in the app. "Revenue" means
   * the total billed value (amount) of every non-cancelled invoice matching
   * `where` -- regardless of payment status -- decomposed into
   * paidAmount/pendingAmount/overdueAmount using the exact same per-invoice
   * paid/pending/overdue classification as toInvoiceResponse (never the raw,
   * possibly-stale `Invoice.status` column). totalRevenue always equals
   * paidAmount + pendingAmount + overdueAmount by construction.
   *
   * Every revenue figure surfaced anywhere in the app (Billing's cards, the
   * Dashboard's Revenue (MTD) card, and the shared monthly revenue chart)
   * must go through this method -- with only `where` varying (caller scope,
   * a date window, or both) -- so they can never disagree.
   */
  private async computeOverview(where: Prisma.InvoiceWhereInput): Promise<BillingOverview> {
    const invoices = await this.prisma.invoice.findMany({
      where: { ...where, status: { not: InvoiceStatus.CANCELLED } },
      include: INVOICE_INCLUDE,
    });

    const totals = invoices.reduce(
      (acc, invoice) => {
        const response = toInvoiceResponse(invoice);
        acc.totalRevenue += response.amount;
        acc.paidAmount += response.amountPaid;
        if (response.status === 'overdue') {
          acc.overdueAmount += response.remaining;
        } else {
          acc.pendingAmount += response.remaining;
        }
        return acc;
      },
      { totalRevenue: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0 },
    );

    return {
      totalRevenue: roundMoney(totals.totalRevenue),
      paidAmount: roundMoney(totals.paidAmount),
      pendingAmount: roundMoney(totals.pendingAmount),
      overdueAmount: roundMoney(totals.overdueAmount),
      totalInvoices: invoices.length,
    };
  }

  /** Billing page summary, scoped to the caller (a doctor only sees their own patients). All-time -- no date window. */
  async overview(caller: AuthenticatedUser): Promise<BillingOverview> {
    const where = caller.role === Role.DOCTOR ? await this.scopedPatientWhere(caller.id) : {};

    if (where === null) {
      return { totalRevenue: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0, totalInvoices: 0 };
    }

    return this.computeOverview(where);
  }

  /** Returns a Prisma where-clause scoped to patients this doctor has an appointment or chat relationship with, or null if there are none (caller has no matches at all). */
  private async scopedPatientWhere(userId: string): Promise<{ patientId: { in: string[] } } | null> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    if (!doctor) {
      return null;
    }

    const patientIds = await this.doctorPatientIds(doctor.id);

    if (patientIds.length === 0) {
      return null;
    }

    return { patientId: { in: patientIds } };
  }

  private async assertOwnPatient(userId: string, patientId: string): Promise<void> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    if (!doctor || !(await this.doctorPatientIds(doctor.id)).includes(patientId)) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async doctorPatientIds(doctorId: string): Promise<string[]> {
    const [fromAppointments, fromMessages] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { doctorId },
        select: { patientId: true },
        distinct: ['patientId'],
      }),
      this.prisma.chatMessage.findMany({
        where: { doctorId },
        select: { patientId: true },
        distinct: ['patientId'],
      }),
    ]);

    return [...new Set([...fromAppointments, ...fromMessages].map((row) => row.patientId))];
  }

  /**
   * Called when a patient books a session with a doctor who charges a
   * consultation fee. The platform's flat consultationMargin (admin-set via
   * PlatformSettingsService) is folded into this single line's price -- the
   * doctor's own consultationFee (what they set, what shows on their public
   * profile and the booking flow) is never touched, only what the patient
   * is actually billed here.
   */
  async createConsultationInvoice(
    patientId: string,
    doctorName: string,
    fee: number,
    dueDate: Date,
    appointmentId?: string,
  ): Promise<InvoiceResponse> {
    const description = `Consultation with Dr. ${doctorName}`;
    const margin = await this.platformSettingsService.getConsultationMargin();
    const chargedAmount = roundMoney(fee + margin);

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId,
        description,
        amount: chargedAmount,
        dueDate,
        appointmentId,
        items: { create: [{ description, quantity: 1, unitPrice: chargedAmount }] },
      },
      include: INVOICE_INCLUDE,
    });

    const response = toInvoiceResponse(invoice);

    await this.notificationsService.create(
      patientId,
      NotificationType.INVOICE_CREATED,
      `New invoice ${response.invoiceNumber}`,
      `${description} — ${response.amount.toFixed(2)}.`,
      `/billing?invoiceId=${invoice.id}`,
    );

    return response;
  }

  /**
   * Called when the appointment that generated a consultation invoice is
   * cancelled. Silently does nothing if there's no linked invoice, it's
   * already cancelled, or it already has payments recorded (a paid/partially
   * paid invoice needs a refund decision, not an automatic cancel).
   */
  async cancelInvoiceForAppointment(appointmentId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { appointmentId }, include: INVOICE_INCLUDE });

    if (!invoice || invoice.status === InvoiceStatus.CANCELLED || invoice.payments.length > 0) {
      return;
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.CANCELLED },
    });

    await this.auditLogService.log({
      actorId: null,
      action: 'UPDATE',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { status: 'CANCELLED', reason: 'appointment_cancelled' },
    });
  }

  /**
   * Hospital-wide billed revenue for invoices issued so far this calendar
   * month -- the same totalRevenue definition as overview(), just windowed
   * to [start of this month, now) by Invoice.createdAt. Sharing
   * computeOverview() here is what guarantees this always agrees with the
   * "Sep" bar of monthlyRevenueTrend() and with the invoices making up
   * Billing's all-time totalRevenue.
   */
  async revenueThisMonth(): Promise<{ amount: number }> {
    const { start, end } = currentMonthRange();
    const { totalRevenue } = await this.computeOverview({ createdAt: { gte: start, lt: end } });
    return { amount: totalRevenue };
  }

  /**
   * Hospital-wide billed revenue for each of the last `months` calendar
   * months (oldest first), bucketed by Invoice.createdAt using the same
   * totalRevenue definition as overview()/revenueThisMonth() -- so the
   * chart and the revenue cards can never disagree. Months with no billed
   * invoices report 0, never null/undefined.
   */
  async monthlyRevenueTrend(months: number): Promise<MonthlyRevenue[]> {
    const ranges = lastCalendarMonths(months);
    const results = await Promise.all(
      ranges.map(({ start, end }) => this.computeOverview({ createdAt: { gte: start, lt: end } })),
    );

    return ranges.map(({ label }, i) => ({ month: label, revenue: results[i].totalRevenue }));
  }
}
