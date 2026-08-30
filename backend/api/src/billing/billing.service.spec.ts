import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Role, type Doctor, type Invoice, type InvoiceItem, type User } from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const doctorCaller: AuthenticatedUser = { id: 'doctor-user-1', email: 'doc@example.com', role: Role.DOCTOR };

function buildDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'doctor-1',
    specialization: 'Cardiology',
    bio: 'Heart stuff',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'doctor-user-1',
    departmentId: 'dept-1',
    ...overrides,
  };
}

type InvoiceWithRelations = Invoice & { patient: Pick<User, 'firstName' | 'lastName'>; items: InvoiceItem[] };

const INVOICE_INCLUDE = { patient: { select: { firstName: true, lastName: true } }, items: true };

function buildItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'item-1',
    invoiceId: 'invoice-1',
    description: 'Consultation',
    quantity: 1,
    unitPrice: 150,
    ...overrides,
  };
}

function buildInvoice(overrides: Partial<InvoiceWithRelations> = {}): InvoiceWithRelations {
  return {
    id: 'invoice-1',
    patientId: 'patient-1',
    description: 'August visit',
    amount: 150,
    status: InvoiceStatus.PENDING,
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    paidAt: null,
    stripeCheckoutSessionId: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
    items: [buildItem()],
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
    phone: null,
    picture: null,
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
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodeHashes: [],
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
    doctor: { findUnique: jest.Mock };
    appointment: { findMany: jest.Mock };
    chatMessage: { findMany: jest.Mock };
  };
  let stripeService: { createCheckoutSession: jest.Mock };

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
      doctor: { findUnique: jest.fn() },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    stripeService = { createCheckoutSession: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  describe('findAll', () => {
    it('returns invoices mapped to the response shape, with items and their line totals, deriving paid/pending/overdue status', async () => {
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
        items: [buildItem({ description: 'Consultation', quantity: 2, unitPrice: 75 })],
      });
      const overdue = buildInvoice({
        id: 'inv-overdue',
        status: InvoiceStatus.PENDING,
        dueDate: new Date('2020-01-01T00:00:00.000Z'),
        createdAt: new Date('2019-12-01T00:00:00.000Z'),
      });
      prisma.invoice.findMany.mockResolvedValue([paid, pending, overdue]);

      const result = await service.findAll(admin);

      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: {},
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ id: 'inv-paid', status: 'paid', patientName: 'Ada Lovelace' });
      expect(result[1].items).toEqual([
        { id: 'item-1', description: 'Consultation', quantity: 2, unitPrice: 75, lineTotal: 150 },
      ]);
      expect(result[2]).toMatchObject({ id: 'inv-overdue', status: 'overdue' });
    });

    it('returns an empty array when there are no invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      await expect(service.findAll(admin)).resolves.toEqual([]);
    });

    it('scopes a doctor caller to invoices for patients they have an appointment or chat relationship with', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'patient-1' }]);
      prisma.chatMessage.findMany.mockResolvedValue([{ patientId: 'patient-2' }]);
      prisma.invoice.findMany.mockResolvedValue([]);

      await service.findAll(doctorCaller);

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: { in: expect.arrayContaining(['patient-1', 'patient-2']) } },
        }),
      );
    });

    it('returns an empty array without querying invoices when the doctor has no linked profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAll(doctorCaller)).resolves.toEqual([]);
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array without querying invoices when the doctor has no patient relationships', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(service.findAll(doctorCaller)).resolves.toEqual([]);
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findMine', () => {
    it("returns only the given patient's invoices, mapped to the response shape", async () => {
      const invoice = buildInvoice({ patientId: 'patient-1' });
      prisma.invoice.findMany.mockResolvedValue([invoice]);

      const result = await service.findMine('patient-1');

      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: { patientId: 'patient-1' },
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: invoice.id, patientId: 'patient-1' });
    });

    it('returns an empty array when the patient has no invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      await expect(service.findMine('patient-1')).resolves.toEqual([]);
    });
  });

  describe('createCheckoutSession', () => {
    it('throws NotFoundException when the invoice does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.createCheckoutSession('patient-1', 'invoice-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the invoice belongs to a different patient", async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ patientId: 'someone-else' }));

      await expect(service.createCheckoutSession('patient-1', 'invoice-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is already paid', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.PAID }));

      await expect(service.createCheckoutSession('patient-1', 'invoice-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("delegates to StripeService for the caller's own unpaid invoice", async () => {
      const invoice = buildInvoice();
      prisma.invoice.findUnique.mockResolvedValue(invoice);
      stripeService.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session-1' });

      const result = await service.createCheckoutSession('patient-1', 'invoice-1');

      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(invoice);
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session-1' });
    });
  });

  describe('create', () => {
    const dto: CreateInvoiceDto = {
      patientId: 'patient-1',
      description: 'August visit',
      items: [
        { description: 'Consultation', quantity: 1, unitPrice: 100 },
        { description: 'Blood panel', quantity: 2, unitPrice: 25 },
      ],
      dueDate: '2026-09-01',
    };

    it('throws BadRequestException when the patient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create(admin, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the target user is not a patient', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient({ role: Role.DOCTOR }));

      await expect(service.create(admin, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the due date cannot be parsed', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());

      await expect(service.create(admin, { ...dto, dueDate: 'not-a-date' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('computes amount as the sum of quantity * unitPrice across items and creates them nested under the invoice', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());
      const created = buildInvoice({
        id: 'inv-new',
        amount: 150,
        items: [
          buildItem({ id: 'item-1', description: 'Consultation', quantity: 1, unitPrice: 100 }),
          buildItem({ id: 'item-2', description: 'Blood panel', quantity: 2, unitPrice: 25 }),
        ],
      });
      prisma.invoice.create.mockResolvedValue(created);

      const result = await service.create(admin, dto);

      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: {
          patientId: 'patient-1',
          description: 'August visit',
          amount: 150,
          dueDate: new Date('2026-09-01'),
          items: {
            create: [
              { description: 'Consultation', quantity: 1, unitPrice: 100 },
              { description: 'Blood panel', quantity: 2, unitPrice: 25 },
            ],
          },
        },
        include: INVOICE_INCLUDE,
      });
      expect(result).toMatchObject({ id: 'inv-new', patientName: 'Ada Lovelace', amount: 150 });
      expect(result.items).toHaveLength(2);
    });

    it('allows a doctor caller to invoice a patient they have a relationship with', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'patient-1' }]);
      prisma.invoice.create.mockResolvedValue(buildInvoice());

      await expect(service.create(doctorCaller, dto)).resolves.toBeDefined();
      expect(prisma.invoice.create).toHaveBeenCalled();
    });

    it('rejects a doctor caller invoicing a patient they have no relationship with', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(service.create(doctorCaller, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('markPaid', () => {
    it('throws NotFoundException when the invoice does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.markPaid(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is already paid', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.PAID }));

      await expect(service.markPaid(admin, 'inv-paid')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('marks a pending invoice as paid, stamping paidAt', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ id: 'inv-1', status: InvoiceStatus.PENDING }));
      const updated = buildInvoice({ id: 'inv-1', status: InvoiceStatus.PAID, paidAt: new Date() });
      prisma.invoice.update.mockResolvedValue(updated);

      const result = await service.markPaid(admin, 'inv-1');

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        include: INVOICE_INCLUDE,
      });
      expect(result).toMatchObject({ id: 'inv-1', status: 'paid' });
    });

    it('rejects a doctor caller marking paid an invoice for a patient they have no relationship with', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ id: 'inv-1', status: InvoiceStatus.PENDING }));
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(service.markPaid(doctorCaller, 'inv-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('allows a doctor caller to mark paid an invoice for their own patient', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ id: 'inv-1', status: InvoiceStatus.PENDING }));
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());
      prisma.appointment.findMany.mockResolvedValue([{ patientId: 'patient-1' }]);
      prisma.invoice.update.mockResolvedValue(buildInvoice({ id: 'inv-1', status: InvoiceStatus.PAID }));

      await expect(service.markPaid(doctorCaller, 'inv-1')).resolves.toMatchObject({ status: 'paid' });
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
