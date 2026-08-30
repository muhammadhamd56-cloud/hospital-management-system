// jest.mock must be declared before importing StripeService (which imports
// 'stripe' itself) -- ts-jest does not hoist jest.mock calls above imports
// the way babel-jest does, so the mock factory has to come first textually.
const mockSessionsCreate = jest.fn();
const mockConstructEvent = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  }));
});

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StripeService', () => {
  let service: StripeService;
  let prisma: { invoice: { update: jest.Mock; findUnique: jest.Mock } };
  let configService: { get: jest.Mock };

  async function buildService(values: Record<string, string | undefined>) {
    configService = { get: jest.fn((key: string) => values[key]) };
    prisma = { invoice: { update: jest.fn(), findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    return module.get(StripeService);
  }

  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockConstructEvent.mockReset();
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
        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { stripeCheckoutSessionId: 'cs_test_1' },
        });
        expect(result).toEqual({ url: 'https://checkout.stripe.com/cs_test_1' });
      });

      it('throws when Stripe returns no session url', async () => {
        mockSessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: null });

        await expect(
          service.createCheckoutSession({ id: 'invoice-1', description: 'August visit', amount: 150 }),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(prisma.invoice.update).not.toHaveBeenCalled();
      });
    });

    describe('handleWebhook', () => {
      function buildEvent(overrides: Record<string, unknown> = {}, type = 'checkout.session.completed') {
        return {
          type,
          data: {
            object: { id: 'cs_test_1', metadata: { invoiceId: 'invoice-1' }, payment_status: 'paid', ...overrides },
          },
        };
      }

      it('verifies the signature against the raw body using the configured webhook secret', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue({
          id: 'invoice-1',
          stripeCheckoutSessionId: 'cs_test_1',
          status: InvoiceStatus.PENDING,
        });

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
        prisma.invoice.findUnique.mockResolvedValue({
          id: 'invoice-1',
          stripeCheckoutSessionId: 'cs_test_1',
          status: InvoiceStatus.PENDING,
        });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
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

      it('ignores a stale/replayed session that does not match the invoice\'s current checkout session', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue({
          id: 'invoice-1',
          stripeCheckoutSessionId: 'cs_a_different_session',
          status: InvoiceStatus.PENDING,
        });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.update).not.toHaveBeenCalled();
      });

      it('is a no-op when the invoice is already paid (safe against Stripe redelivering the same webhook)', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue({
          id: 'invoice-1',
          stripeCheckoutSessionId: 'cs_test_1',
          status: InvoiceStatus.PAID,
        });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.update).not.toHaveBeenCalled();
      });

      it('marks the invoice paid when the session matches and it is not already paid', async () => {
        mockConstructEvent.mockReturnValue(buildEvent());
        prisma.invoice.findUnique.mockResolvedValue({
          id: 'invoice-1',
          stripeCheckoutSessionId: 'cs_test_1',
          status: InvoiceStatus.PENDING,
        });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
          where: { id: 'invoice-1' },
          data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
        });
      });
    });
  });
});
