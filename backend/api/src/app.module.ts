import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { DoctorsModule } from './doctors/doctors.module';
import { DoctorPortalModule } from './doctor-portal/doctor-portal.module';
import { ChatModule } from './chat/chat.module';
import { BedsModule } from './beds/beds.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { StaffModule } from './staff/staff.module';
import { LaboratoryModule } from './laboratory/laboratory.module';
import { ReportsModule } from './reports/reports.module';
import { StaffSchedulingModule } from './staff-scheduling/staff-scheduling.module';
import { StaffPortalModule } from './staff-portal/staff-portal.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuditLogModule } from './audit-log/audit-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    AppointmentsModule,
    DoctorsModule,
    DoctorPortalModule,
    ChatModule,
    BedsModule,
    BillingModule,
    NotificationsModule,
    MedicalRecordsModule,
    StaffModule,
    LaboratoryModule,
    ReportsModule,
    StaffSchedulingModule,
    StaffPortalModule,
    AnnouncementsModule,
  ],
  providers: [
    // The e2e suite alone signs up dozens of accounts in a few seconds --
    // real request-rate abuse isn't something the test env needs guarding
    // against, and NODE_ENV=test is set by Jest itself, never in prod.
    ...(process.env.NODE_ENV === 'test' ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
  ],
})
export class AppModule {}
