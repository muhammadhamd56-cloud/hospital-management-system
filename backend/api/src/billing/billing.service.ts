import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  NotificationType,
  PaymentMethod,
  Role,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type User,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { roundMoney } from '../common/money.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
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
}

export type InvoiceDisplayStatus = 'paid' | 'pending' | 'partially_paid' | 'overdue' | 'cancelled';

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

type InvoiceWithRelations = Invoice & {
  patient: Pick<User, 'firstName' | 'lastName'>;
  items: InvoiceItem[];
  payments: (Payment & { recordedBy: Pick<User, 'firstName' | 'lastName'> | null })[];
};


function toInvoiceResponse(invoice: InvoiceWithRelations): InvoiceResponse {
  const subtotal = roundMoney(invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - item.discount), 0));
  const amount = roundMoney(subtotal - invoice.discount + invoice.tax);
  const amountPaid = roundMoney(invoice.payments.reduce((sum, payment) => sum + payment.amount, 0));
  const remaining = roundMoney(Math.max(0, amount - amountPaid));
  const isPastDue = invoice.dueDate.getTime() < Date.now();

  let status: InvoiceDisplayStatus;
  if (invoice.status === InvoiceStatus.CANCELLED) {
    status = 'cancelled';
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
      .map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        recordedBy: payment.recordedBy ? `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`.trim() : null,
        createdAt: payment.createdAt.toISOString(),
      })),
  };
}

const INVOICE_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  items: true,
  payments: { include: { recordedBy: { select: { firstName: true, lastName: true } } } },
} as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
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
   * Dashboard summary. Total Revenue is the total billed value of every
   * non-cancelled invoice; it always equals paidAmount + pendingAmount +
   * overdueAmount, since every invoice's remaining balance falls into
   * exactly one of the pending/overdue buckets and its paid portion always
   * counts toward paidAmount.
   */
  async overview(caller: AuthenticatedUser): Promise<BillingOverview> {
    const where = caller.role === Role.DOCTOR ? await this.scopedPatientWhere(caller.id) : {};

    if (where === null) {
      return { totalRevenue: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0, totalInvoices: 0 };
    }

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

  /** Called when a patient books a session with a doctor who charges a consultation fee. */
  async createConsultationInvoice(
    patientId: string,
    doctorName: string,
    fee: number,
    dueDate: Date,
    appointmentId?: string,
  ): Promise<InvoiceResponse> {
    const description = `Consultation with Dr. ${doctorName}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId,
        description,
        amount: roundMoney(fee),
        dueDate,
        appointmentId,
        items: { create: [{ description, quantity: 1, unitPrice: fee }] },
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

  /** Actual money collected this calendar month, across every payment method (Stripe included). */
  async revenueThisMonth(): Promise<{ amount: number }> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const result = await this.prisma.payment.aggregate({
      where: { createdAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    return { amount: roundMoney(result._sum.amount ?? 0) };
  }
}
