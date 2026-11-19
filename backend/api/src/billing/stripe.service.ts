import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AuditAction, InvoiceStatus, NotificationType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { roundMoney } from '../common/money.util';
import { formatInvoiceNumber } from './invoice-number.util';
import { lockInvoice, MONEY_TX_OPTIONS } from './invoice-lock';

type RefundsInclude = { items: true; payments: { include: { refunds: true } } };
type InvoiceWithMoney = Prisma.InvoiceGetPayload<{ include: RefundsInclude }>;

/** Total owed and net paid (payments minus their refunds) -- the same figures toInvoiceResponse derives. */
function balanceOf(invoice: InvoiceWithMoney): { total: number; amountPaid: number; remaining: number } {
  const total = roundMoney(
    invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - item.discount), 0) -
      invoice.discount +
      invoice.tax,
  );
  const amountPaid = roundMoney(
    invoice.payments.reduce((sum, p) => sum + (p.amount - p.refunds.reduce((s, r) => s + r.amount, 0)), 0),
  );
  return { total, amountPaid, remaining: roundMoney(Math.max(0, total - amountPaid)) };
}

/** The stored status matching a balance. A CANCELLED invoice stays cancelled -- money arriving late doesn't revive it. */
function statusFor(invoice: InvoiceWithMoney, amountPaid: number, remaining: number): InvoiceStatus {
  if (invoice.status === InvoiceStatus.CANCELLED) return InvoiceStatus.CANCELLED;
  if (remaining <= 0.01) return InvoiceStatus.PAID;
  return amountPaid > 0.01 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.PENDING;
}

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
    private readonly auditLogService: AuditLogService,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    this.clientUrl = this.configService.get<string>('clientUrl') ?? 'http://localhost:5173';
  }

  /**
   * Creates a Stripe Checkout Session for the given (already-validated,
   * not-yet-paid) invoice. Any previous session for it is expired first, so
   * a patient who clicked Pay twice can't complete both tabs and pay twice.
   * Throws a clear, user-facing error if Stripe isn't configured -- never
   * pretends payment is possible when it isn't.
   */
  async createCheckoutSession(invoice: {
    id: string;
    description: string;
    amount: number;
    previousSessionId?: string | null;
  }): Promise<{ url: string }> {
    if (!this.stripe) {
      this.logger.warn(`STRIPE_SECRET_KEY not configured -- cannot create checkout session for invoice ${invoice.id}`);
      throw new InternalServerErrorException('Online payments are not set up yet. Please contact the front desk.');
    }

    if (invoice.previousSessionId) {
      await this.expireCheckoutSession(invoice.previousSessionId);
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

    // Compare-and-swap: only record this session if no concurrent request
    // (e.g. a double-clicked "Pay") swapped in its own since we read the
    // invoice. Otherwise two live sessions could both be paid -- so the loser
    // expires the session it just created instead of leaving it payable.
    const swapped = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, stripeCheckoutSessionId: invoice.previousSessionId ?? null },
      data: { stripeCheckoutSessionId: session.id },
    });

    if (swapped.count === 0) {
      await this.expireCheckoutSession(session.id);
      throw new ConflictException('A payment for this invoice is already being started. Please try again.');
    }

    return { url: session.url };
  }

  /**
   * Best effort: stops an open Checkout Session from being paid. Stripe
   * refuses to expire one that already completed (or expired) -- that's
   * fine, the webhook records a completed one regardless -- so failures are
   * logged, never thrown.
   */
  async expireCheckoutSession(sessionId: string): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      this.logger.log(
        `Checkout session ${sessionId} not expired: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Refunds a Stripe-taken payment (full or partial, in cents) by its
   * PaymentIntent id. Only ever called for a Payment that has one -- see
   * BillingService.refundPayment, which handles cash/bank/manual payments
   * (nothing to call Stripe for) itself. `idempotencyKey` makes a retried
   * call return the refund Stripe already made instead of refunding again.
   */
  async refundPayment(paymentIntentId: string, amountCents: number, idempotencyKey?: string): Promise<Stripe.Refund> {
    if (!this.stripe) {
      this.logger.warn(`STRIPE_SECRET_KEY not configured -- cannot refund payment intent ${paymentIntentId}`);
      throw new InternalServerErrorException('Online refunds are not set up yet. Please contact support.');
    }

    return this.stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: amountCents },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  /**
   * Verifies the request really came from Stripe (signature, not JWT --
   * this endpoint has no logged-in caller). Handles both `checkout.session.completed`
   * (fires immediately for card payments) and `checkout.session.async_payment_succeeded`
   * (fires later for delayed-notification methods, e.g. bank transfers) --
   * since payment methods aren't restricted to cards (see
   * createCheckoutSession), a session can complete while still
   * `payment_status: 'unpaid'`, so that status is what actually gates
   * recording the payment, not the event type alone. Also handles
   * `charge.refunded`, so a refund issued directly from the Stripe
   * Dashboard (rather than through BillingService.refundPayment) still ends
   * up recorded here -- without it, that money would look paid in our own
   * records forever. Every other event type is a no-op.
   *
   * Stripe delivers at least once and may retry or deliver concurrently, so
   * every handler here is idempotent and runs under the invoice row lock.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException('Stripe webhook is not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      // A 400 tells Stripe (or whoever sent it) the request itself is bad -- not worth retrying.
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (event.type === 'charge.refunded') {
      await this.syncChargeRefunds(event.data.object as Stripe.Charge);
      return;
    }

    // A refund can be accepted (and recorded) and then fail later, e.g. the
    // card was closed. Subscribe the endpoint to these events in Stripe.
    if (event.type === 'refund.failed' || event.type === 'refund.updated') {
      await this.reverseFailedRefund(event.data.object as Stripe.Refund);
      return;
    }

    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      return;
    }

    await this.recordCheckoutPayment(event.type, event.data.object as Stripe.Checkout.Session);
  }

  /**
   * Records the money a completed Checkout Session actually took. The
   * session's metadata.invoiceId is signed by Stripe, so it -- not "is this
   * the latest session we created" -- is what ties a payment to an invoice:
   * a charge that really happened is always recorded, even from an older
   * tab. Deduped on the PaymentIntent (unique in the schema), so a
   * redelivered event never records the same charge twice.
   */
  private async recordCheckoutPayment(eventType: string, session: Stripe.Checkout.Session): Promise<void> {
    if (session.payment_status === 'unpaid') {
      return;
    }

    const invoiceId = session.metadata?.invoiceId;

    if (!invoiceId) {
      this.logger.warn(`${eventType} for session ${session.id} has no invoiceId metadata`);
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);
    const chargedAmount = roundMoney((session.amount_total ?? 0) / 100);

    let result: { invoice: InvoiceWithMoney; paymentId: string; remaining: number; overpaidBy: number } | null;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await lockInvoice(tx, invoiceId);
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: { items: true, payments: { include: { refunds: true } } },
        });

        if (!invoice) {
          this.logger.error(`${eventType} for session ${session.id} references missing invoice ${invoiceId}`);
          return null;
        }

        if (paymentIntentId && invoice.payments.some((p) => p.stripePaymentIntentId === paymentIntentId)) {
          return null; // Already recorded by an earlier delivery of this event.
        }

        const before = balanceOf(invoice);
        const payment = await tx.payment.create({
          data: {
            invoiceId,
            amount: chargedAmount,
            method: PaymentMethod.CARD,
            recordedById: null,
            stripePaymentIntentId: paymentIntentId,
          },
        });

        const amountPaid = roundMoney(before.amountPaid + chargedAmount);
        const remaining = roundMoney(Math.max(0, before.total - amountPaid));
        const status = statusFor(invoice, amountPaid, remaining);

        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status, paidAt: status === InvoiceStatus.PAID ? (invoice.paidAt ?? new Date()) : null },
        });

        return {
          invoice,
          paymentId: payment.id,
          remaining,
          overpaidBy: roundMoney(Math.max(0, chargedAmount - before.remaining)),
        };
      }, MONEY_TX_OPTIONS);
    } catch (error) {
      // Two deliveries of one event raced past the check above; the unique
      // PaymentIntent constraint stopped the second. Already recorded.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }

    if (!result) {
      return;
    }

    const { invoice, paymentId, overpaidBy } = result;
    this.logger.log(`Invoice ${invoiceId} received a $${chargedAmount} payment via Stripe session ${session.id}`);

    // The money has moved either way, so it's recorded -- but a cancelled
    // invoice or a charge beyond what was owed needs a person to refund it.
    if (invoice.status === InvoiceStatus.CANCELLED || overpaidBy > 0) {
      const reason = invoice.status === InvoiceStatus.CANCELLED ? 'invoice_cancelled' : 'overpayment';
      this.logger.error(
        `Stripe payment ${paymentId} on invoice ${invoiceId} needs review (${reason}, excess ${overpaidBy.toFixed(2)})`,
      );
      await this.auditLogService.log({
        actorId: null,
        action: AuditAction.UPDATE,
        entityType: 'Payment',
        entityId: paymentId,
        metadata: { invoiceId, needsReview: reason, chargedAmount, excess: overpaidBy },
      });
    }

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
   * or a previous delivery of this same webhook event). Runs under the
   * invoice lock BillingService.refundPayment also takes, so it never races
   * that endpoint into inserting the same refund. Without this, a refund
   * issued directly from the Stripe Dashboard would silently desync from
   * our own records.
   */
  private async syncChargeRefunds(charge: Stripe.Charge): Promise<void> {
    const stripe = this.stripe;
    if (!stripe) return;

    const paymentIntentId =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent?.id ?? null);

    if (!paymentIntentId) return;

    const located = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { invoiceId: true },
    });

    if (!located) {
      this.logger.warn(`charge.refunded for payment intent ${paymentIntentId} has no matching Payment row`);
      return;
    }

    // Fetched before taking the lock -- no point holding it across a network call that doesn't need it.
    const stripeRefunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });

    const synced = await this.prisma.$transaction(async (tx) => {
      await lockInvoice(tx, located.invoiceId);
      const payment = await tx.payment.findFirst({
        where: { stripePaymentIntentId: paymentIntentId },
        include: { refunds: true },
      });

      if (!payment) return null;

      const knownRefundIds = new Set(payment.refunds.map((refund) => refund.stripeRefundId));
      const newRefunds = stripeRefunds.data.filter(
        (refund) => refund.status !== 'failed' && refund.status !== 'canceled' && !knownRefundIds.has(refund.id),
      );

      if (newRefunds.length === 0) return null;

      for (const refund of newRefunds) {
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            amount: roundMoney(refund.amount / 100),
            stripeRefundId: refund.id,
            refundedById: null,
          },
        });
      }

      const invoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
        include: { items: true, payments: { include: { refunds: true } } },
      });

      if (!invoice) return null;

      const { amountPaid, remaining } = balanceOf(invoice);

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: statusFor(invoice, amountPaid, remaining),
          paidAt: remaining <= 0.01 ? invoice.paidAt : null,
        },
      });

      return { invoice, totalRefunded: roundMoney(newRefunds.reduce((sum, refund) => sum + refund.amount / 100, 0)) };
    }, MONEY_TX_OPTIONS);

    if (!synced) return;

    await this.notificationsService.create(
      synced.invoice.patientId,
      NotificationType.PAYMENT_REFUNDED,
      'Payment refunded',
      `A refund of ${synced.totalRefunded.toFixed(2)} was issued for Invoice ${formatInvoiceNumber(synced.invoice.invoiceNumber)}.`,
      `/billing?invoiceId=${synced.invoice.id}`,
    );
  }

  /**
   * Undoes our Refund row for a Stripe refund that ended up failed or
   * canceled -- that money never went back, so the invoice must count it as
   * paid again. Idempotent: redeliveries (or a refund we never recorded) are
   * no-ops. Runs under the same invoice lock as the other money writes.
   */
  private async reverseFailedRefund(refund: Stripe.Refund): Promise<void> {
    if (refund.status !== 'failed' && refund.status !== 'canceled') return;

    const recorded = await this.prisma.refund.findUnique({
      where: { stripeRefundId: refund.id },
      select: { payment: { select: { invoiceId: true } } },
    });

    if (!recorded) return;

    const invoiceId = recorded.payment.invoiceId;

    const reversed = await this.prisma.$transaction(async (tx) => {
      await lockInvoice(tx, invoiceId);
      const deleted = await tx.refund.deleteMany({ where: { stripeRefundId: refund.id } });
      if (deleted.count === 0) return null;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, payments: { include: { refunds: true } } },
      });
      if (!invoice) return null;

      const { amountPaid, remaining } = balanceOf(invoice);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: statusFor(invoice, amountPaid, remaining),
          paidAt: remaining <= 0.01 ? (invoice.paidAt ?? new Date()) : null,
        },
      });

      return invoice;
    }, MONEY_TX_OPTIONS);

    if (reversed) {
      this.logger.warn(
        `Stripe refund ${refund.id} ${refund.status} (${refund.failure_reason ?? 'no reason given'}) -- ` +
          `removed it from invoice ${reversed.id}; staff should follow up with the patient`,
      );
    }
  }
}
