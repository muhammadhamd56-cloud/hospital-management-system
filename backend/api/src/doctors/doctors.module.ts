import { Module } from '@nestjs/common';
import { DoctorsController } from './doctors.controller';
import { PublicDoctorsController } from './public-doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  controllers: [DoctorsController, PublicDoctorsController],
  providers: [DoctorsService],
})
export class DoctorsModule {}
