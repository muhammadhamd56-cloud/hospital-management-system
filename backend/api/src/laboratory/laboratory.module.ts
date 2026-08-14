import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryService } from './laboratory.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
})
export class LaboratoryModule {}
