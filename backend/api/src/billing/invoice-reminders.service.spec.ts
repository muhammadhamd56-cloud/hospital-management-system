import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceRemindersService } from './invoice-reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

function buildOverdueInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    invoiceNumber: 7,
    patientId: 'patient-1',
    description: 'August visit',
    discount: 0,
    tax: 0,
    status: InvoiceStatus.PENDING,
    dueDate: new Date(Date.now() - 60 * 60 * 1000),
    paidAt: null,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    overdueNotifiedAt: null,
    patient: { id: 'patient-1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
    items: [{ id: 'item-1', description: 'Consultation', quantity: 1, unitPrice: 150, discount: 0 }],
    payments: [],
    ...overrides,
  };
}

describe('InvoiceRemindersService', () => {
  let service: InvoiceRemindersService;
  let prisma: { invoice: { findMany: jest.Mock; updateMany: jest.Mock } };
  let emailService: { sendInvoiceOverdueEmail: jest.Mock };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = { invoice: { findMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    emailService = { sendInvoiceOverdueEmail: jest.fn().mockResolvedValue(undefined) };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(InvoiceRemindersService);
  });

  it('queries only non-cancelled, not-yet-notified invoices past their due date', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await service.sendOverdueNotices();

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: InvoiceStatus.CANCELLED },
          overdueNotifiedAt: null,
          dueDate: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('claims each overdue invoice (stamping overdueNotifiedAt), then emails and notifies the patient', async () => {
    const invoice = buildOverdueInvoice();
    prisma.invoice.findMany.mockResolvedValue([invoice]);

    const sent = await service.sendOverdueNotices();

    expect(emailService.sendInvoiceOverdueEmail).toHaveBeenCalledWith(
      'ada@example.com',
      expect.objectContaining({ patientName: 'Ada Lovelace', invoiceNumber: 'INV-0007', amount: 150 }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      'patient-1',
      'INVOICE_OVERDUE',
      'Invoice overdue',
      expect.stringContaining('INV-0007'),
      '/billing?invoiceId=invoice-1',
    );
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'invoice-1', overdueNotifiedAt: null },
      data: { overdueNotifiedAt: expect.any(Date) },
    });
    expect(prisma.invoice.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      emailService.sendInvoiceOverdueEmail.mock.invocationCallOrder[0],
    );
    expect(sent).toBe(1);
  });

  it('skips an invoice another run already claimed, so the patient is not notified twice', async () => {
    prisma.invoice.findMany.mockResolvedValue([buildOverdueInvoice()]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

    const sent = await service.sendOverdueNotices();

    expect(emailService.sendInvoiceOverdueEmail).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('sends only once when two overlapping runs both read the same invoice before either marks it', async () => {
    // One shared row: both runs' findMany see it unmarked; the conditional
    // updateMany is the compare-and-swap that lets exactly one of them win.
    const row = { id: 'invoice-1', overdueNotifiedAt: null as Date | null };
    prisma.invoice.findMany.mockImplementation(async () => [buildOverdueInvoice()]);
    prisma.invoice.updateMany.mockImplementation(
      async ({ where, data }: { where: { id: string; overdueNotifiedAt: null }; data: { overdueNotifiedAt: Date } }) => {
        if (where.id !== row.id || row.overdueNotifiedAt !== where.overdueNotifiedAt) return { count: 0 };
        row.overdueNotifiedAt = data.overdueNotifiedAt;
        return { count: 1 };
      },
    );

    const [first, second] = await Promise.all([service.sendOverdueNotices(), service.sendOverdueNotices()]);

    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(2);
    expect(first + second).toBe(1);
    expect(emailService.sendInvoiceOverdueEmail).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(row.overdueNotifiedAt).toBeInstanceOf(Date);
  });

  it('skips a candidate that is technically past due but already fully paid (re-derived via toInvoiceResponse, not trusted from the query alone)', async () => {
    const invoice = buildOverdueInvoice({
      payments: [{ id: 'payment-1', amount: 150, recordedBy: null, refunds: [], createdAt: new Date() }],
    });
    prisma.invoice.findMany.mockResolvedValue([invoice]);

    const sent = await service.sendOverdueNotices();

    expect(emailService.sendInvoiceOverdueEmail).not.toHaveBeenCalled();
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('still sends a notice for a past-due invoice that was partially refunded and still has a balance', async () => {
    const invoice = buildOverdueInvoice({
      payments: [
        { id: 'payment-1', amount: 150, recordedBy: null, refunds: [{ amount: 40 }], createdAt: new Date() },
      ],
    });
    prisma.invoice.findMany.mockResolvedValue([invoice]);

    const sent = await service.sendOverdueNotices();

    expect(emailService.sendInvoiceOverdueEmail).toHaveBeenCalled();
    expect(sent).toBe(1);
  });

  it('keeps processing remaining invoices when one fails partway through', async () => {
    const first = buildOverdueInvoice({ id: 'invoice-1' });
    const second = buildOverdueInvoice({ id: 'invoice-2', patientId: 'patient-2' });
    prisma.invoice.findMany.mockResolvedValue([first, second]);
    notificationsService.create.mockRejectedValueOnce(new Error('db hiccup')).mockResolvedValueOnce(undefined);

    const sent = await service.sendOverdueNotices();

    expect(emailService.sendInvoiceOverdueEmail).toHaveBeenCalledTimes(2);
    expect(sent).toBe(1);
  });

  it('does nothing when there are no overdue candidates', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await expect(service.sendOverdueNotices()).resolves.toBe(0);
    expect(emailService.sendInvoiceOverdueEmail).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});
