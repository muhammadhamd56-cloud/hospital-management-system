import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly clientUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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
   * Verifies the request really came from Stripe (signature, not JWT --
   * this endpoint has no logged-in caller) and marks the matching invoice
   * paid. Handles both `checkout.session.completed` (fires immediately for
   * card payments) and `checkout.session.async_payment_succeeded` (fires
   * later for delayed-notification methods, e.g. bank transfers) -- since
   * payment methods aren't restricted to cards (see createCheckoutSession),
   * a session can complete while still `payment_status: 'unpaid'`, so that
   * status is what actually gates marking the invoice paid, not the event
   * type alone. Ignores events for a session that isn't the invoice's most
   * recent one (stale/replayed webhook) and events for an already-paid
   * invoice (Stripe redelivers webhooks; this makes re-processing a no-op
   * instead of a double-charge-adjacent bug).
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException('Stripe webhook is not configured');
    }

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

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

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice || invoice.stripeCheckoutSessionId !== session.id || invoice.status === InvoiceStatus.PAID) {
      return;
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
    });

    this.logger.log(`Invoice ${invoiceId} marked paid via Stripe session ${session.id}`);
  }
}
