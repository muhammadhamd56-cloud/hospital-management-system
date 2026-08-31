import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicalRecordsModule } from '../medical-records/medical-records.module';
import { BillingModule } from '../billing/billing.module';
import { DoctorPortalController } from './doctor-portal.controller';
import { DoctorPortalService } from './doctor-portal.service';

@Module({
  imports: [NotificationsModule, MedicalRecordsModule, BillingModule],
  controllers: [DoctorPortalController],
  providers: [DoctorPortalService],
  exports: [DoctorPortalService],
})
export class DoctorPortalModule {}
