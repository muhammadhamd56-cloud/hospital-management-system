import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { BillingModule } from '../billing/billing.module';
import { ChatModule } from '../chat/chat.module';
import { DoctorPortalModule } from '../doctor-portal/doctor-portal.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [AppointmentsModule, BillingModule, ChatModule, DoctorPortalModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
