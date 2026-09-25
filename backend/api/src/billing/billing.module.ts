import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { InvoiceRemindersService } from './invoice-reminders.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [NotificationsModule, EmailModule, PlatformSettingsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService, InvoiceRemindersService],
  exports: [BillingService],
})
export class BillingModule {}
