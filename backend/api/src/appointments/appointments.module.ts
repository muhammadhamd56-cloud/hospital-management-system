import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentRemindersService } from './appointment-reminders.service';

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentRemindersService],
})
export class AppointmentsModule {}
