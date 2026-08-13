import { IsBoolean } from 'class-validator';

export class DoctorAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;
}
