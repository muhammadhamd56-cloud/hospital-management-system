import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Role, type Invoice, type User } from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';

type InvoiceWithPatient = Invoice & { patient: Pick<User, 'firstName' | 'lastName'> };

const PATIENT_INCLUDE = { patient: { select: { firstName: true, lastName: true } } };

function buildInvoice(overrides: Partial<InvoiceWithPatient> = {}): InvoiceWithPatient {
  return {
    id: 'invoice-1',
    patientId: 'patient-1',
    description: 'Consultation fee',
    amount: 150,
    status: InvoiceStatus.PENDING,
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    paidAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
    ...overrides,
  };
}

function buildPatient(overrides: Partial<User> = {}): User {
  return {
    id: 'patient-1',
    googleId: null,
    email: 'ada@example.com',
    password: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    picture: null,
    role: Role.PATIENT,
    roleSelected: true,
    emailVerified: true,
    otpCodeHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLastSentAt: null,
    tokenVersion: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    invoice: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      invoice: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BillingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BillingService);
  });

  describe('findAll', () => {
    it('returns invoices mapped to the response shape, deriving paid/pending/overdue status', async () => {
      const paid = buildInvoice({
        id: 'inv-paid',
        status: InvoiceStatus.PAID,
        dueDate: new Date('2026-07-01T00:00:00.000Z'),
        paidAt: new Date('2026-06-15T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const pending = buildInvoice({
        id: 'inv-pending',
        status: InvoiceStatus.PENDING,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      const overdue = buildInvoice({
        id: 'inv-overdue',
        status: InvoiceStatus.PENDING,
        dueDate: new Date('2020-01-01T00:00:00.000Z'),
        createdAt: new Date('2019-12-01T00:00:00.000Z'),
      });
      prisma.invoice.findMany.mockResolvedValue([paid, pending, overdue]);

      const result = await service.findAll();

      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        include: PATIENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ id: 'inv-paid', status: 'paid', patientName: 'Ada Lovelace' });
      expect(result[1]).toMatchObject({ id: 'inv-pending', status: 'pending' });
      expect(result[2]).toMatchObject({ id: 'inv-overdue', status: 'overdue' });
    });

    it('returns an empty array when there are no invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      await expect(service.findAll()).resolves.toEqual([]);
    });
  });

  describe('create', () => {
    const dto: CreateInvoiceDto = {
      patientId: 'patient-1',
      description: 'Consultation fee',
      amount: 150,
      dueDate: '2026-09-01',
    };

    it('throws BadRequestException when the patient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the target user is not a patient', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient({ role: Role.DOCTOR }));

      await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the due date cannot be parsed', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());

      await expect(service.create({ ...dto, dueDate: 'not-a-date' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('creates the invoice for a valid patient and returns it in the response shape', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());
      const created = buildInvoice({ id: 'inv-new', amount: 150, description: 'Consultation fee' });
      prisma.invoice.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: {
          patientId: 'patient-1',
          description: 'Consultation fee',
          amount: 150,
          dueDate: new Date('2026-09-01'),
        },
        include: PATIENT_INCLUDE,
      });
      expect(result).toMatchObject({ id: 'inv-new', patientName: 'Ada Lovelace', amount: 150 });
    });
  });

  describe('markPaid', () => {
    it('throws NotFoundException when the invoice does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.markPaid('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is already paid', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.PAID }));

      await expect(service.markPaid('inv-paid')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('marks a pending invoice as paid, stamping paidAt', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ id: 'inv-1', status: InvoiceStatus.PENDING }));
      const updated = buildInvoice({ id: 'inv-1', status: InvoiceStatus.PAID, paidAt: new Date() });
      prisma.invoice.update.mockResolvedValue(updated);

      const result = await service.markPaid('inv-1');

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        include: PATIENT_INCLUDE,
      });
      expect(result).toMatchObject({ id: 'inv-1', status: 'paid' });
    });
  });

  describe('revenueThisMonth', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns the summed amount of invoices paid within the current calendar month', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { amount: 4200 } });

      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const expectedEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const result = await service.revenueThisMonth();

      expect(result).toEqual({ amount: 4200 });
      expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
        where: { status: InvoiceStatus.PAID, paidAt: { gte: expectedStart, lt: expectedEnd } },
        _sum: { amount: true },
      });
    });

    it('returns 0 when there is no revenue recorded yet this month', async () => {
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { amount: null } });

      await expect(service.revenueThisMonth()).resolves.toEqual({ amount: 0 });
    });
  });
});
