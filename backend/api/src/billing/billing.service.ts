import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Role, type Invoice, type InvoiceItem, type User } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { StripeService } from './stripe.service';

export interface InvoiceItemResponse {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceResponse {
  id: string;
  patientId: string;
  patientName: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  items: InvoiceItemResponse[];
}

type InvoiceWithRelations = Invoice & { patient: Pick<User, 'firstName' | 'lastName'>; items: InvoiceItem[] };

function toInvoiceResponse(invoice: InvoiceWithRelations): InvoiceResponse {
  const isOverdue = invoice.status === InvoiceStatus.PENDING && invoice.dueDate.getTime() < Date.now();

  return {
    id: invoice.id,
    patientId: invoice.patientId,
    patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`.trim(),
    description: invoice.description,
    amount: invoice.amount,
    issueDate: invoice.createdAt.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    status: invoice.status === InvoiceStatus.PAID ? 'paid' : isOverdue ? 'overdue' : 'pending',
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.quantity * item.unitPrice,
    })),
  };
}

const INVOICE_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  items: true,
} as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
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

  /** Starts an online payment for one of the caller's own invoices. */
  async createCheckoutSession(patientId: string, invoiceId: string): Promise<{ url: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice || invoice.patientId !== patientId) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    return this.stripeService.createCheckoutSession(invoice);
  }

  /** Called when a patient books a session with a doctor who charges a consultation fee. */
  async createConsultationInvoice(
    patientId: string,
    doctorName: string,
    fee: number,
    dueDate: Date,
  ): Promise<InvoiceResponse> {
    const description = `Consultation with Dr. ${doctorName}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId,
        description,
        amount: fee,
        dueDate,
        items: { create: [{ description, quantity: 1, unitPrice: fee }] },
      },
      include: INVOICE_INCLUDE,
    });

    return toInvoiceResponse(invoice);
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

    const amount = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId: dto.patientId,
        description: dto.description,
        amount,
        dueDate,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });

    return toInvoiceResponse(invoice);
  }

  async markPaid(caller: AuthenticatedUser, id: string): Promise<InvoiceResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (caller.role === Role.DOCTOR) {
      await this.assertOwnPatient(caller.id, invoice.patientId);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
      include: INVOICE_INCLUDE,
    });

    return toInvoiceResponse(updated);
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

  async revenueThisMonth(): Promise<{ amount: number }> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const result = await this.prisma.invoice.aggregate({
      where: { status: InvoiceStatus.PAID, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    return { amount: result._sum.amount ?? 0 };
  }
}
