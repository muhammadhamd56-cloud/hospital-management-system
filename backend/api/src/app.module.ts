import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
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
    PharmacyModule,
    ReportsModule,
  ],
})
export class AppModule {}
