import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountApprovalsController } from './account-approvals.controller';
import { AccountApprovalsService } from './account-approvals.service';

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [AccountApprovalsController],
  providers: [AccountApprovalsService],
  exports: [AccountApprovalsService],
})
export class AccountApprovalsModule {}
