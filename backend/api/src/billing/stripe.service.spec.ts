// jest.mock must be declared before importing StripeService (which imports
// 'stripe' itself) -- ts-jest does not hoist jest.mock calls above imports
// the way babel-jest does, so the mock factory has to come first textually.
const mockSessionsCreate = jest.fn();
const mockSessionsExpire = jest.fn();
const mockConstructEvent = jest.fn();
const mockRefundsCreate = jest.fn();
const mockRefundsList = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate, expire: mockSessionsExpire } },
    webhooks: { constructEvent: mockConstructEvent },
    refunds: { create: mockRefundsCreate, list: mockRefundsList },
  }));
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';

function buildInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    patientId: 'patient-1',
    invoiceNumber: 7,
    stripeCheckoutSessionId: 'cs_test_1',
    status: InvoiceStatus.PENDING,
    discount: 0,
    tax: 0,
    items: [{ quantity: 1, unitPrice: 150, discount: 0 }],
    payments: [],
    ...overrides,
  };
}

describe('StripeService', () => {
  let service: StripeService;
  let prisma: {
    invoice: { update: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock };
    payment: { create: jest.Mock; findFirst: jest.Mock };
    refund: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let auditLogService: { log: jest.Mock };
  let configService: { get: jest.Mock };
  let notificationsService: { create: jest.Mock };

  async function buildService(values: Record<string, string | undefined>) {
    configService = { get: jest.fn((key: string) => values[key]) };
    prisma = {
      invoice: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn() },
      payment: { create: jest.fn().mockResolvedValue({ id: 'payment-new' }), findFirst: jest.fn() },
      refund: { create: jest.fn().mockResolvedValue(undefined) },
      // Runs the callback against the same mocks, as if inside the transaction.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    return module.get(StripeService);
  }

  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockSessionsExpire.mockReset();
    mockConstructEvent.mockReset();
    mockRefundsCreate.mockReset();
    mockRefundsList.mockReset();
    (Stripe as unknown as jest.Mock).mockClear();
  });

  describe('when STRIPE_SECRET_KEY is not configured', () => {
    beforeEach(async () => {
      service = await buildService({ 'clientUrl': 'http://localhost:5173' });
    });

    it('does not construct a Stripe client', () => {
      expect(Stripe).not.toHaveBeenCalled();
    });

    it('createCheckoutSession throws a clear, user-facing error instead of pretending to work', async () => {
      await expect(
        service.createCheckoutSession({ id: 'invoice-1', description: 'August visit', amount: 150 }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('handleWebhook throws since it cannot verify a signature with no configured client', async () => {
      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('refundPayment throws a clear, user-facing error instead of pretending to work', async () => {
      await expect(service.refundPayment('pi_123', 5000)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(mockRefundsCreate).not.toHaveBeenCalled();
    });
  });

  describe('when fully configured', () => {
    beforeEach(async () => {
      service = await buildService({
        'stripe.secretKey': 'sk_test_123',
        'stripe.webhookSecret': 'whsec_123',
        'clientUrl': 'http://localhost:5173',
      });
    });

    it('constructs the Stripe client with the configured secret key', () => {
      expect(Stripe).toHaveBeenCalledWith('sk_test_123');
    });

    describe('createCheckoutSession', () => {
      it('creates a session in dollars-to-cents, with invoice metadata and the client success/cancel urls, then records the session id', async () => {
        mockSessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/cs_test_1' });

        const result = await service.createCheckoutSession({
          id: 'invoice-1',
          description: 'August visit',
          amount: 150.5,
        });

        expect(mockSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'payment',
            success_url: 'http://localhost:5173/billing?paid=1',
            cancel_url: 'http://localhost:5173/billing?paid=0',
            metadata: { invoiceId: 'invoice-1' },
            line_items: [
              expect.objectContaining({
                price_data: expect.objectContaining({
                  unit_amount: 15050,
                  product_data: { name: 'August visit' },
                }),
              }),
            ],
          }),
        );
        // Compare-and-swap against the session id read with the invoice.
        expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
          where: { id: 'invoice-1', stripeCheckoutSessionId: null },
          data: { stripeCheckoutSessionId: 'cs_test_1' },
        });
        expect(result).toEqual({ url: 'https://checkout.stripe.com/cs_test_1' });
      });

      it("expires the invoice's previous checkout session first, so two open tabs cannot both be paid", async () => {
        mockSessionsCreate.mockResolvedValue({ id: 'cs_test_2', url: 'https://checkout.stripe.com/cs_test_2' });

        await service.createCheckoutSession({
          id: 'invoice-1',
          description: 'August visit',
          amount: 150,
          previousSessionId: 'cs_test_1',
        });

        expect(mockSessionsExpire).toHaveBeenCalledWith('cs_test_1');
        expect(mockSessionsExpire.mock.invocationCallOrder[0]).toBeLessThan(
          mockSessionsCreate.mock.invocationCallOrder[0],
        );
      });

      it('still creates the new session when the previous one can no longer be expired', async () => {
        mockSessionsExpire.mockRejectedValue(new Error('session already completed'));
        mockSessionsCreate.mockResolvedValue({ id: 'cs_test_2', url: 'https://checkout.stripe.com/cs_test_2' });

        await expect(
          service.createCheckoutSession({ id: 'invoice-1', description: 'x', amount: 150, previousSessionId: 'cs_old' }),
        ).resolves.toEqual({ url: 'https://checkout.stripe.com/cs_test_2' });
      });

      it('throws when Stripe returns no session url', async () => {
        mockSessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: null });

        await expect(
          service.createCheckoutSession({ id: 'invoice-1', description: 'August visit', amount: 150 }),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
      });

      it('expires its own new session and 409s when a concurrent request already swapped in another', async () => {
        mockSessionsCreate.mockResolvedValue({ id: 'cs_loser', url: 'https://checkout.stripe.com/cs_loser' });
        prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.createCheckoutSession({ id: 'invoice-1', description: 'x', amount: 150, previousSessionId: 'cs_old' }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(mockSessionsExpire).toHaveBeenCalledWith('cs_loser');
      });
    });

    describe('refundPayment', () => {
      it('refunds a payment intent in cents', async () => {
        mockRefundsCreate.mockResolvedValue({ id: 're_123' });

        const result = await service.refundPayment('pi_123', 6000);

        expect(mockRefundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_123', amount: 6000 }, undefined);
        expect(result).toEqual({ id: 're_123' });
      });

      it('passes the idempotency key through to Stripe', async () => {
        mockRefundsCreate.mockResolvedValue({ id: 're_123' });

        await service.refundPayment('pi_123', 6000, 'refund:payment-1:0:6000');

        expect(mockRefundsCreate).toHaveBeenCalledWith(
          { payment_intent: 'pi_123', amount: 6000 },
          { idempotencyKey: 'refund:payment-1:0:6000' },
        );
      });
    });

    describe('handleWebhook', () => {
      function buildEvent(overrides: Record<string, unknown> = {}, type = 'checkout.session.completed') {
        return {
          type,
          data: {
            object: {
              id: 'cs_test_1',
              metadata: { invoiceId: 'invoice-1' },
              payment_status: 'paid',
              amount_total: 15000,
              payment_intent: 'pi_test_1',
              ...overrides,
            },
          },
        };
      }

      it('verifies the signature against the raw body using the configured webhook secret', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(buildInvoiceRow());

        const rawBody = Buffer.from('{"raw":true}');
        await service.handleWebhook(rawBody, 'sig_header');

        expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, 'sig_header', 'whsec_123');
      });

      it('ignores event types other than checkout.session.completed/async_payment_succeeded', async () => {
        mockConstructEvent.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
      });

      it('ignores checkout.session.completed while payment_status is still unpaid (delayed-notification methods)', async () => {
        mockConstructEvent.mockReturnValue(buildEvent({ payment_status: 'unpaid' }));

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
      });

      it('marks the invoice paid on checkout.session.async_payment_succeeded (delayed-notification methods)', async () => {
        mockConstructEvent.mockReturnValue(buildEvent({}, 'checkout.session.async_payment_succeeded'));
        prisma.invoice.findUnique.mockResolvedValue(buildInvoiceRow());

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.payment.create).toHaveBeenCalledWith({
          data: {
            invoiceId: 'invoice-1',
            amount: 150,
            method: PaymentMethod.CARD,
            recordedById: null,
            stripePaymentIntentId: 'pi_test_1',
          },
        });
        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        });
      });

      it('marks the invoice PARTIALLY_PAID when the Stripe payment does not cover the full remaining balance', async () => {
        mockConstructEvent.mockReturnValue(buildEvent({ amount_total: 5000 }));
        prisma.invoice.findUnique.mockResolvedValue(buildInvoiceRow());

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.payment.create).toHaveBeenCalledWith({
          data: {
            invoiceId: 'invoice-1',
            amount: 50,
            method: PaymentMethod.CARD,
            recordedById: null,
            stripePaymentIntentId: 'pi_test_1',
          },
        });
        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PARTIALLY_PAID, paidAt: null },
        });
      });

      it('ignores a session with no invoiceId metadata', async () => {
        mockConstructEvent.mockReturnValue(buildEvent({ metadata: {} }));

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
      });

      it('ignores the event when the invoice no longer exists', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(null);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.update).not.toHaveBeenCalled();
      });

      it('rejects a request whose signature does not verify with a 400, not a 500', async () => {
        mockConstructEvent.mockImplementation(() => {
          throw new Error('No signatures found matching the expected signature');
        });

        await expect(service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('records a payment taken through an older checkout session -- the card was charged, so it must not be dropped', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(
          buildInvoiceRow({ stripeCheckoutSessionId: 'cs_a_newer_session' }),
        );

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.payment.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ amount: 150, stripePaymentIntentId: 'pi_test_1' }) }),
        );
        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        });
      });

      it('takes the invoice row lock before reading the balance', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(buildInvoiceRow());

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.$queryRaw).toHaveBeenCalled();
        expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.invoice.findUnique.mock.invocationCallOrder[0],
        );
      });

      it('is a no-op when this payment intent was already recorded (Stripe redelivering the same event)', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(
          buildInvoiceRow({
            status: InvoiceStatus.PAID,
            payments: [{ amount: 150, stripePaymentIntentId: 'pi_test_1', refunds: [] }],
          }),
        );

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.payment.create).not.toHaveBeenCalled();
        expect(prisma.invoice.update).not.toHaveBeenCalled();
        expect(notificationsService.create).not.toHaveBeenCalled();
      });

      it('treats a unique-constraint race on the payment intent as already recorded', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.$transaction.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
        );

        await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toBeUndefined();
        expect(notificationsService.create).not.toHaveBeenCalled();
      });

      it('counts refunded money as unpaid when deciding whether the invoice is now settled', async () => {
        mockConstructEvent.mockReturnValue(buildEvent({ amount_total: 10000, payment_intent: 'pi_second' }));
        prisma.invoice.findUnique.mockResolvedValue(
          buildInvoiceRow({ payments: [{ amount: 150, stripePaymentIntentId: 'pi_first', refunds: [{ amount: 100 }] }] }),
        );

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        // 150 paid - 100 refunded + 100 now = 150 of 150.
        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        });
        expect(auditLogService.log).not.toHaveBeenCalled();
      });

      it('records money taken on a cancelled invoice without reviving it, and flags it for review', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(buildInvoiceRow({ status: InvoiceStatus.CANCELLED }));

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.payment.create).toHaveBeenCalled();
        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.CANCELLED, paidAt: null },
        });
        expect(auditLogService.log).toHaveBeenCalledWith(
          expect.objectContaining({ metadata: expect.objectContaining({ needsReview: 'invoice_cancelled' }) }),
        );
      });

      it('flags a charge that exceeds the remaining balance (e.g. cash recorded while checkout was open)', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(
          buildInvoiceRow({ payments: [{ amount: 40, stripePaymentIntentId: null, refunds: [] }] }),
        );

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.payment.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ amount: 150 }) }),
        );
        expect(auditLogService.log).toHaveBeenCalledWith(
          expect.objectContaining({ metadata: expect.objectContaining({ needsReview: 'overpayment', excess: 40 }) }),
        );
      });

      it('marks the invoice paid when the session matches and it is not already paid', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue(buildInvoiceRow());

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        });
        expect(notificationsService.create).toHaveBeenCalledWith(
          'patient-1',
          'PAYMENT_RECEIVED',
          'Payment received',
          expect.stringContaining('INV-0007'),
          '/billing?invoiceId=invoice-1',
        );
      });

      describe('charge.refunded', () => {
        function buildChargeRefundedEvent(overrides: Record<string, unknown> = {}) {
          return {
            type: 'charge.refunded',
            data: { object: { payment_intent: 'pi_test_1', ...overrides } },
          };
        }

        it("warns and does nothing when no Payment row matches the charge's payment intent", async () => {
          mockConstructEvent.mockReturnValue(buildChargeRefundedEvent());
          prisma.payment.findFirst.mockResolvedValue(null);

          await service.handleWebhook(Buffer.from('{}'), 'sig');

          expect(mockRefundsList).not.toHaveBeenCalled();
          expect(prisma.refund.create).not.toHaveBeenCalled();
        });

        it('skips a Stripe refund that has already been recorded (by our own refund endpoint, or a prior delivery of this same event)', async () => {
          mockConstructEvent.mockReturnValue(buildChargeRefundedEvent());
          prisma.payment.findFirst.mockResolvedValue({
            id: 'payment-1',
            invoiceId: 'invoice-1',
            refunds: [{ stripeRefundId: 're_already_known' }],
          });
          mockRefundsList.mockResolvedValue({ data: [{ id: 're_already_known', amount: 6000 }] });

          await service.handleWebhook(Buffer.from('{}'), 'sig');

          expect(prisma.refund.create).not.toHaveBeenCalled();
        });

        it('records a new Stripe-Dashboard-initiated refund and syncs the invoice status/notification', async () => {
          mockConstructEvent.mockReturnValue(buildChargeRefundedEvent());
          prisma.payment.findFirst.mockResolvedValue({ id: 'payment-1', invoiceId: 'invoice-1', refunds: [] });
          mockRefundsList.mockResolvedValue({ data: [{ id: 're_new', amount: 6000 }] });
          prisma.invoice.findUnique.mockResolvedValue({
            id: 'invoice-1',
            patientId: 'patient-1',
            invoiceNumber: 7,
            discount: 0,
            tax: 0,
            items: [{ quantity: 1, unitPrice: 150, discount: 0 }],
            payments: [{ amount: 150, refunds: [{ amount: 60 }] }],
          });

          await service.handleWebhook(Buffer.from('{}'), 'sig');

          expect(mockRefundsList).toHaveBeenCalledWith({ payment_intent: 'pi_test_1', limit: 100 });
          expect(prisma.refund.create).toHaveBeenCalledWith({
            data: { paymentId: 'payment-1', amount: 60, stripeRefundId: 're_new', refundedById: null },
          });
          expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: { id: 'invoice-1' },
            data: { status: InvoiceStatus.PARTIALLY_PAID, paidAt: null },
          });
          expect(notificationsService.create).toHaveBeenCalledWith(
            'patient-1',
            'PAYMENT_REFUNDED',
            'Payment refunded',
            expect.stringContaining('60.00'),
            '/billing?invoiceId=invoice-1',
          );
        });
      });
    });
  });
});
