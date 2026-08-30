import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService],
})
export class BillingModule {}
