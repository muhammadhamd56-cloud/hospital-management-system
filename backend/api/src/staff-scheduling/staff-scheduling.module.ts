import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ShiftOpeningsController } from './shift-openings.controller';
import { ShiftOpeningsService } from './shift-openings.service';
import { ShiftApplicationsController } from './shift-applications.controller';
import { ShiftApplicationsService } from './shift-applications.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskRemindersService } from './task-reminders.service';

@Module({
  imports: [NotificationsModule],
  controllers: [
    StaffController,
    ShiftsController,
    TemplatesController,
    AvailabilityController,
    AttendanceController,
    ShiftOpeningsController,
    ShiftApplicationsController,
    TasksController,
  ],
  providers: [
    StaffService,
    ShiftsService,
    TemplatesService,
    AvailabilityService,
    AttendanceService,
    ShiftOpeningsService,
    ShiftApplicationsService,
    TasksService,
    TaskRemindersService,
  ],
  exports: [ShiftsService, ShiftApplicationsService, ShiftOpeningsService, TasksService],
})
export class StaffSchedulingModule {}
