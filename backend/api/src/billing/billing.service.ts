import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Role, type Invoice, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

export interface InvoiceResponse {
  id: string;
  patientId: string;
  patientName: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
}

type InvoiceWithPatient = Invoice & { patient: Pick<User, 'firstName' | 'lastName'> };

function toInvoiceResponse(invoice: InvoiceWithPatient): InvoiceResponse {
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
  };
}

const PATIENT_INCLUDE = { patient: { select: { firstName: true, lastName: true } } } as const;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<InvoiceResponse[]> {
    const invoices = await this.prisma.invoice.findMany({
      include: PATIENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map(toInvoiceResponse);
  }

  async create(dto: CreateInvoiceDto): Promise<InvoiceResponse> {
    const patient = await this.prisma.user.findUnique({ where: { id: dto.patientId } });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new BadRequestException('Patient not found');
    }

    const dueDate = new Date(dto.dueDate);

    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid due date');
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId: dto.patientId,
        description: dto.description,
        amount: dto.amount,
        dueDate,
      },
      include: PATIENT_INCLUDE,
    });

    return toInvoiceResponse(invoice);
  }

  async markPaid(id: string): Promise<InvoiceResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
      include: PATIENT_INCLUDE,
    });

    return toInvoiceResponse(updated);
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
