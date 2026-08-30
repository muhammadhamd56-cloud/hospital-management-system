import { BadRequestException, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from './stripe.service';

/**
 * Public on purpose -- Stripe calls this directly, with no user session.
 * Authenticity is verified via the Stripe-Signature header against the raw
 * request body (see main.ts, which registers a raw body parser for this
 * exact path before the global JSON parser -- signature verification
 * needs the untouched bytes, not the re-serialized parsed object).
 */
@Controller('billing/webhooks')
export class StripeWebhookController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(@Req() req: Request): Promise<{ received: true }> {
    const signature = req.headers['stripe-signature'];

    if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
      throw new BadRequestException('Invalid webhook request');
    }

    await this.stripeService.handleWebhook(req.body, signature);
    return { received: true };
  }
}
