import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentMethod,
  Role,
  type Doctor,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type User,
} from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    consultationFee: 0,
    appointmentDurationMinutes: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'doctor-user-1',
    departmentId: 'dept-1',
    ...overrides,
  };
}

type PaymentWithRecordedBy = Payment & { recordedBy: Pick<User, 'firstName' | 'lastName'> | null };

type InvoiceWithRelations = Invoice & {
  patient: Pick<User, 'firstName' | 'lastName'>;
  items: InvoiceItem[];
  payments: PaymentWithRecordedBy[];
};

const INVOICE_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  items: true,
  payments: { include: { recordedBy: { select: { firstName: true, lastName: true } } } },
};

function buildItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'item-1',
    invoiceId: 'invoice-1',
    description: 'Consultation',
    quantity: 1,
    unitPrice: 150,
    discount: 0,
    ...overrides,
  };
}

function buildPayment(overrides: Partial<PaymentWithRecordedBy> = {}): PaymentWithRecordedBy {
  return {
    id: 'payment-1',
    invoiceId: 'invoice-1',
    amount: 50,
    method: PaymentMethod.CASH,
    recordedById: 'admin-1',
    recordedBy: { firstName: 'Admin', lastName: 'User' },
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    ...overrides,
  };
}

function buildInvoice(overrides: Partial<InvoiceWithRelations> = {}): InvoiceWithRelations {
  return {
    id: 'invoice-1',
    invoiceNumber: 1,
    patientId: 'patient-1',
    description: 'August visit',
    amount: 150,
    discount: 0,
    tax: 0,
    status: InvoiceStatus.PENDING,
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    paidAt: null,
    stripeCheckoutSessionId: null,
    appointmentId: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
    items: [buildItem()],
    payments: [],
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
    };
    payment: { create: jest.Mock; aggregate: jest.Mock };
    user: { findUnique: jest.Mock };
    doctor: { findUnique: jest.Mock };
    appointment: { findMany: jest.Mock };
    chatMessage: { findMany: jest.Mock };
  };
  let stripeService: { createCheckoutSession: jest.Mock };
  let auditLogService: { log: jest.Mock };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: { create: jest.fn(), aggregate: jest.fn() },
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    stripeService = { createCheckoutSession: jest.fn() };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripeService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  describe('findAll', () => {
    it('returns invoices mapped to the response shape, with items and their line totals, deriving paid/pending/overdue status', async () => {
      const paid = buildInvoice({
        id: 'inv-paid',
        invoiceNumber: 2,
        status: InvoiceStatus.PAID,
        dueDate: new Date('2026-07-01T00:00:00.000Z'),
        paidAt: new Date('2026-06-15T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        payments: [buildPayment({ amount: 150 })],
      });
      const pending = buildInvoice({
        id: 'inv-pending',
        invoiceNumber: 3,
        status: InvoiceStatus.PENDING,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        items: [buildItem({ description: 'Consultation', quantity: 2, unitPrice: 75 })],
      });
      const overdue = buildInvoice({
        id: 'inv-overdue',
        invoiceNumber: 4,
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
      expect(result[0]).toMatchObject({ id: 'inv-paid', invoiceNumber: 'INV-0002', status: 'paid', patientName: 'Ada Lovelace' });
      expect(result[1].items).toEqual([
        { id: 'item-1', description: 'Consultation', quantity: 2, unitPrice: 75, discount: 0, lineTotal: 150 },
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

  describe('findOne', () => {
    it('throws NotFoundException when the invoice does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.findOne(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a doctor caller viewing an invoice for a patient they have no relationship with', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice());
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(service.findOne(doctorCaller, 'invoice-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the invoice for an admin caller', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice());

      await expect(service.findOne(admin, 'invoice-1')).resolves.toMatchObject({ id: 'invoice-1' });
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

    it('throws NotFoundException when the invoice belongs to a different patient', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ patientId: 'someone-else' }));

      await expect(service.createCheckoutSession('patient-1', 'invoice-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is already paid', async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        buildInvoice({ status: InvoiceStatus.PAID, payments: [buildPayment({ amount: 150 })] }),
      );

      await expect(service.createCheckoutSession('patient-1', 'invoice-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is cancelled', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.CANCELLED }));

      await expect(service.createCheckoutSession('patient-1', 'invoice-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("charges only the remaining balance when a partial payment has already been recorded", async () => {
      const invoice = buildInvoice({ payments: [buildPayment({ amount: 50 })] });
      prisma.invoice.findUnique.mockResolvedValue(invoice);
      stripeService.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session-1' });

      const result = await service.createCheckoutSession('patient-1', 'invoice-1');

      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith({
        id: 'invoice-1',
        description: 'August visit',
        amount: 100,
      });
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

    it('throws BadRequestException when a line item discount exceeds its own line total', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());

      await expect(
        service.create(admin, {
          ...dto,
          items: [{ description: 'Consultation', quantity: 1, unitPrice: 50, discount: 60 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice-level discount exceeds the subtotal', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());

      await expect(service.create(admin, { ...dto, discount: 1000 })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('computes the subtotal as the sum of quantity * unitPrice - discount across items, and creates them nested under the invoice', async () => {
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
          discount: 0,
          tax: 0,
          dueDate: new Date('2026-09-01'),
          items: {
            create: [
              { description: 'Consultation', quantity: 1, unitPrice: 100, discount: 0 },
              { description: 'Blood panel', quantity: 2, unitPrice: 25, discount: 0 },
            ],
          },
        },
        include: INVOICE_INCLUDE,
      });
      expect(result).toMatchObject({ id: 'inv-new', patientName: 'Ada Lovelace', amount: 150 });
      expect(result.items).toHaveLength(2);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'admin-1', action: 'CREATE', entityType: 'Invoice' }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        'INVOICE_CREATED',
        expect.stringContaining('INV-'),
        expect.any(String),
        '/billing?invoiceId=inv-new',
      );
    });

    it('applies an invoice-level discount and tax on top of the item subtotal', async () => {
      prisma.user.findUnique.mockResolvedValue(buildPatient());
      prisma.invoice.create.mockResolvedValue(buildInvoice({ amount: 150, discount: 5, tax: 10 }));

      await service.create(admin, { ...dto, discount: 5, tax: 10 });

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discount: 5, tax: 10 }) }),
      );
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

  describe('createConsultationInvoice', () => {
    it('creates a single-item invoice for the consultation fee, due at the appointment time', async () => {
      const dueDate = new Date('2099-01-01T10:00:00.000Z');
      const created = buildInvoice({
        id: 'inv-consult',
        description: 'Consultation with Dr. Grace Hopper',
        amount: 150,
        dueDate,
        items: [
          buildItem({
            id: 'item-consult',
            description: 'Consultation with Dr. Grace Hopper',
            quantity: 1,
            unitPrice: 150,
          }),
        ],
      });
      prisma.invoice.create.mockResolvedValue(created);

      const result = await service.createConsultationInvoice('patient-1', 'Grace Hopper', 150, dueDate);

      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: {
          patientId: 'patient-1',
          description: 'Consultation with Dr. Grace Hopper',
          amount: 150,
          dueDate,
          items: {
            create: [{ description: 'Consultation with Dr. Grace Hopper', quantity: 1, unitPrice: 150 }],
          },
        },
        include: INVOICE_INCLUDE,
      });
      expect(result).toMatchObject({ id: 'inv-consult', amount: 150 });
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        'INVOICE_CREATED',
        expect.stringContaining('INV-'),
        expect.any(String),
        '/billing?invoiceId=inv-consult',
      );
    });

    it('links the invoice to the appointment when an appointmentId is given', async () => {
      const dueDate = new Date('2099-01-01T10:00:00.000Z');
      prisma.invoice.create.mockResolvedValue(buildInvoice({ appointmentId: 'appt-1' }));

      await service.createConsultationInvoice('patient-1', 'Grace Hopper', 150, dueDate, 'appt-1');

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ appointmentId: 'appt-1' }) }),
      );
    });
  });

  describe('cancelInvoiceForAppointment', () => {
    it('does nothing when there is no invoice linked to the appointment', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await service.cancelInvoiceForAppointment('appt-1');

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('does nothing when the linked invoice already has payments recorded', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ payments: [buildPayment({ amount: 50 })] }));

      await service.cancelInvoiceForAppointment('appt-1');

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('does nothing when the linked invoice is already cancelled', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.CANCELLED }));

      await service.cancelInvoiceForAppointment('appt-1');

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('cancels an unpaid invoice linked to the appointment', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ id: 'inv-1', appointmentId: 'appt-1' }));

      await service.cancelInvoiceForAppointment('appt-1');

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.CANCELLED },
      });
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: null, entityType: 'Invoice', entityId: 'inv-1' }),
      );
    });
  });

  describe('recordPayment', () => {
    it('throws NotFoundException when the invoice does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        service.recordPayment(admin, 'missing', { amount: 50, method: PaymentMethod.CASH }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException against a cancelled invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.CANCELLED }));

      await expect(
        service.recordPayment(admin, 'invoice-1', { amount: 50, method: PaymentMethod.CASH }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is already fully paid', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ payments: [buildPayment({ amount: 150 })] }));

      await expect(
        service.recordPayment(admin, 'invoice-1', { amount: 50, method: PaymentMethod.CASH }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects a payment that would exceed the remaining balance', async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        buildInvoice({ amount: 500, items: [buildItem({ unitPrice: 500 })] }),
      );

      await expect(
        service.recordPayment(admin, 'invoice-1', { amount: 600, method: PaymentMethod.CASH }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('records a partial payment, leaving the invoice PARTIALLY_PAID', async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        buildInvoice({ id: 'inv-1', amount: 500, items: [buildItem({ unitPrice: 500 })] }),
      );
      prisma.invoice.update.mockResolvedValue(
        buildInvoice({
          id: 'inv-1',
          amount: 500,
          items: [buildItem({ unitPrice: 500 })],
          status: InvoiceStatus.PARTIALLY_PAID,
          payments: [buildPayment({ amount: 200 })],
        }),
      );

      const result = await service.recordPayment(
        admin,
        'inv-1',
        { amount: 200, method: PaymentMethod.CASH },
        'admin-1',
      );

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: { invoiceId: 'inv-1', amount: 200, method: PaymentMethod.CASH, recordedById: 'admin-1' },
      });
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.PARTIALLY_PAID, paidAt: null },
        include: INVOICE_INCLUDE,
      });
      expect(result).toMatchObject({ status: 'partially_paid', amountPaid: 200, remaining: 300 });
      expect(notificationsService.create).toHaveBeenCalledWith(
        'patient-1',
        'PAYMENT_RECEIVED',
        'Payment received',
        expect.stringContaining('200.00'),
        '/billing?invoiceId=inv-1',
      );
    });

    it('records a payment that fully settles the remaining balance, marking the invoice PAID', async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        buildInvoice({
          id: 'inv-1',
          amount: 500,
          items: [buildItem({ unitPrice: 500 })],
          payments: [buildPayment({ amount: 200 })],
        }),
      );
      prisma.invoice.update.mockResolvedValue(
        buildInvoice({
          id: 'inv-1',
          amount: 500,
          items: [buildItem({ unitPrice: 500 })],
          status: InvoiceStatus.PAID,
          paidAt: new Date(),
          payments: [buildPayment({ amount: 200 }), buildPayment({ id: 'payment-2', amount: 300 })],
        }),
      );

      const result = await service.recordPayment(
        admin,
        'inv-1',
        { amount: 300, method: PaymentMethod.CARD },
        'admin-1',
      );

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        include: INVOICE_INCLUDE,
      });
      expect(result).toMatchObject({ status: 'paid', amountPaid: 500, remaining: 0 });
    });

    it('rejects a doctor caller recording a payment for a patient they have no relationship with', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice());
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(
        service.recordPayment(doctorCaller, 'invoice-1', { amount: 50, method: PaymentMethod.CASH }, doctorCaller.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when the invoice does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.cancel(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the invoice already has payments recorded', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ payments: [buildPayment({ amount: 50 })] }));

      await expect(service.cancel(admin, 'invoice-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the invoice is already cancelled', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice({ status: InvoiceStatus.CANCELLED }));

      await expect(service.cancel(admin, 'invoice-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancels an unpaid invoice with no payments recorded', async () => {
      prisma.invoice.findUnique.mockResolvedValue(buildInvoice());
      prisma.invoice.update.mockResolvedValue(buildInvoice({ status: InvoiceStatus.CANCELLED }));

      const result = await service.cancel(admin, 'invoice-1');

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'invoice-1' },
        data: { status: InvoiceStatus.CANCELLED },
        include: INVOICE_INCLUDE,
      });
      expect(result.status).toBe('cancelled');
    });
  });

  describe('overview', () => {
    it('sums total revenue as paid + pending + overdue across non-cancelled invoices', async () => {
      const paidInvoice = buildInvoice({
        id: 'inv-paid',
        amount: 100,
        items: [buildItem({ unitPrice: 100 })],
        payments: [buildPayment({ amount: 100 })],
      });
      const pendingInvoice = buildInvoice({
        id: 'inv-pending',
        amount: 50,
        items: [buildItem({ unitPrice: 50 })],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const overdueInvoice = buildInvoice({
        id: 'inv-overdue',
        amount: 25,
        items: [buildItem({ unitPrice: 25 })],
        dueDate: new Date('2020-01-01T00:00:00.000Z'),
      });
      prisma.invoice.findMany.mockResolvedValue([paidInvoice, pendingInvoice, overdueInvoice]);

      const result = await service.overview(admin);

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { not: InvoiceStatus.CANCELLED } } }),
      );
      expect(result).toEqual({
        totalRevenue: 175,
        paidAmount: 100,
        pendingAmount: 50,
        overdueAmount: 25,
        totalInvoices: 3,
      });
    });

    it('returns all zeros for a doctor with no patient relationships', async () => {
      prisma.doctor.findUnique.mockResolvedValue(buildDoctor());

      await expect(service.overview(doctorCaller)).resolves.toEqual({
        totalRevenue: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        totalInvoices: 0,
      });
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe('revenueThisMonth', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns the sum of payments actually collected within the current calendar month', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 4200 } });

      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const expectedEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const result = await service.revenueThisMonth();

      expect(result).toEqual({ amount: 4200 });
      expect(prisma.payment.aggregate).toHaveBeenCalledWith({
        where: { createdAt: { gte: expectedStart, lt: expectedEnd } },
        _sum: { amount: true },
      });
    });

    it('returns 0 when there is no revenue recorded yet this month', async () => {
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });

      await expect(service.revenueThisMonth()).resolves.toEqual({ amount: 0 });
    });
  });
});
