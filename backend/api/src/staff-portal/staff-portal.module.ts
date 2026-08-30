import { Module } from '@nestjs/common';
import { StaffSchedulingModule } from '../staff-scheduling/staff-scheduling.module';
import { StaffPortalController } from './staff-portal.controller';
import { StaffPortalService } from './staff-portal.service';

@Module({
  imports: [StaffSchedulingModule],
  controllers: [StaffPortalController],
  providers: [StaffPortalService],
})
export class StaffPortalModule {}
