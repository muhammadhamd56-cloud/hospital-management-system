import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InvoiceStatus, NotificationType, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { roundMoney } from '../common/money.util';
import { formatInvoiceNumber } from './invoice-number.util';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly clientUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    this.clientUrl = this.configService.get<string>('clientUrl') ?? 'http://localhost:5173';
  }

  /**
   * Creates a Stripe Checkout Session for the given (already-validated,
   * not-yet-paid) invoice and records its session id so the webhook can
   * confirm it belongs to this attempt. Throws a clear, user-facing error
   * if Stripe isn't configured -- never pretends payment is possible when
   * it isn't.
   */
  async createCheckoutSession(invoice: {
    id: string;
    description: string;
    amount: number;
  }): Promise<{ url: string }> {
    if (!this.stripe) {
      this.logger.warn(`STRIPE_SECRET_KEY not configured -- cannot create checkout session for invoice ${invoice.id}`);
      throw new InternalServerErrorException('Online payments are not set up yet. Please contact the front desk.');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      // No payment_method_types -- omitting it enables Stripe's dynamic
      // payment method selection instead of locking this to cards only.
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: invoice.description || `Invoice ${invoice.id}` },
            unit_amount: Math.round(invoice.amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { invoiceId: invoice.id },
      success_url: `${this.clientUrl}/billing?paid=1`,
      cancel_url: `${this.clientUrl}/billing?paid=0`,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Failed to start checkout session');
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { url: session.url };
  }

  /**
   * Refunds a Stripe-taken payment (full or partial, in cents) by its
   * PaymentIntent id. Only ever called for a Payment that has one -- see
   * BillingService.refundPayment, which handles cash/bank/manual payments
   * (nothing to call Stripe for) itself.
   */
  async refundPayment(paymentIntentId: string, amountCents: number): Promise<Stripe.Refund> {
    if (!this.stripe) {
      this.logger.warn(`STRIPE_SECRET_KEY not configured -- cannot refund payment intent ${paymentIntentId}`);
      throw new InternalServerErrorException('Online refunds are not set up yet. Please contact support.');
    }

    return this.stripe.refunds.create({ payment_intent: paymentIntentId, amount: amountCents });
  }

  /**
   * Verifies the request really came from Stripe (signature, not JWT --
   * this endpoint has no logged-in caller). Handles both `checkout.session.completed`
   * (fires immediately for card payments) and `checkout.session.async_payment_succeeded`
   * (fires later for delayed-notification methods, e.g. bank transfers) --
   * since payment methods aren't restricted to cards (see
   * createCheckoutSession), a session can complete while still
   * `payment_status: 'unpaid'`, so that status is what actually gates
   * marking the invoice paid, not the event type alone. Also handles
   * `charge.refunded`, so a refund issued directly from the Stripe
   * Dashboard (rather than through BillingService.refundPayment) still ends
   * up recorded here -- without it, that money would look paid in our own
   * records forever. Every other event type is a no-op.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException('Stripe webhook is not configured');
    }

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

    if (event.type === 'charge.refunded') {
      await this.syncChargeRefunds(event.data.object as Stripe.Charge);
      return;
    }

    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === 'unpaid') {
      return;
    }

    const invoiceId = session.metadata?.invoiceId;

    if (!invoiceId) {
      this.logger.warn(`${event.type} for session ${session.id} has no invoiceId metadata`);
      return;
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, payments: true },
    });

    if (!invoice || invoice.stripeCheckoutSessionId !== session.id || invoice.status === InvoiceStatus.PAID) {
      return;
    }

    const subtotal = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - item.discount), 0);
    const total = roundMoney(subtotal - invoice.discount + invoice.tax);
    const alreadyPaid = roundMoney(invoice.payments.reduce((sum, payment) => sum + payment.amount, 0));
    const chargedAmount = roundMoney((session.amount_total ?? 0) / 100);

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);

    await this.prisma.payment.create({
      data: {
        invoiceId,
        amount: chargedAmount,
        method: PaymentMethod.CARD,
        recordedById: null,
        stripePaymentIntentId: paymentIntentId,
      },
    });

    const newAmountPaid = roundMoney(alreadyPaid + chargedAmount);
    const isFullyPaid = newAmountPaid >= total - 0.01;

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
        paidAt: isFullyPaid ? new Date() : null,
      },
    });

    this.logger.log(`Invoice ${invoiceId} received a $${chargedAmount} payment via Stripe session ${session.id}`);

    await this.notificationsService.create(
      invoice.patientId,
      NotificationType.PAYMENT_RECEIVED,
      'Payment received',
      `Payment of ${chargedAmount.toFixed(2)} received for Invoice ${formatInvoiceNumber(invoice.invoiceNumber)}.`,
      `/billing?invoiceId=${invoiceId}`,
    );
  }

  /**
   * Mirrors every Stripe refund for a charge's PaymentIntent into our own
   * Refund rows, skipping any already recorded (by BillingService.refundPayment,
   * or a previous delivery of this same webhook event) via the unique
   * stripeRefundId constraint check below -- safe to run on Stripe's
   * webhook retries. Without this, a refund issued directly from the
   * Stripe Dashboard would silently desync from our own records.
   */
  private async syncChargeRefunds(charge: Stripe.Charge): Promise<void> {
    if (!this.stripe) return;

    const paymentIntentId =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent?.id ?? null);

    if (!paymentIntentId) return;

    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { refunds: true },
    });

    if (!payment) {
      this.logger.warn(`charge.refunded for payment intent ${paymentIntentId} has no matching Payment row`);
      return;
    }

    const knownRefundIds = new Set(payment.refunds.map((refund) => refund.stripeRefundId));
    const stripeRefunds = await this.stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
    const newRefunds = stripeRefunds.data.filter((refund) => !knownRefundIds.has(refund.id));

    if (newRefunds.length === 0) return;

    for (const refund of newRefunds) {
      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amount: roundMoney(refund.amount / 100),
          stripeRefundId: refund.id,
          refundedById: null,
        },
      });
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payment.invoiceId },
      include: { items: true, payments: { include: { refunds: true } } },
    });

    if (!invoice) return;

    const total = roundMoney(
      invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - item.discount), 0) -
        invoice.discount +
        invoice.tax,
    );
    const amountPaid = roundMoney(
      invoice.payments.reduce((sum, p) => sum + (p.amount - p.refunds.reduce((s, r) => s + r.amount, 0)), 0),
    );
    const remaining = roundMoney(Math.max(0, total - amountPaid));

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status:
          remaining <= 0.01
            ? InvoiceStatus.PAID
            : amountPaid > 0.01
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.PENDING,
        paidAt: remaining <= 0.01 ? invoice.paidAt : null,
      },
    });

    const totalRefunded = roundMoney(newRefunds.reduce((sum, refund) => sum + refund.amount / 100, 0));

    await this.notificationsService.create(
      invoice.patientId,
      NotificationType.PAYMENT_REFUNDED,
      'Payment refunded',
      `A refund of ${totalRefunded.toFixed(2)} was issued for Invoice ${formatInvoiceNumber(invoice.invoiceNumber)}.`,
      `/billing?invoiceId=${invoice.id}`,
    );
  }
}
