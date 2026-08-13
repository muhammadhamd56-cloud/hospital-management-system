import { IsIn, IsString, MinLength } from 'class-validator';

export class BookAppointmentDto {
  @IsString()
  @MinLength(1, { message: 'Doctor is required' })
  doctorId!: string;

  @IsString()
  @MinLength(1, { message: 'Date and time are required' })
  scheduledAt!: string;

  @IsIn(['online', 'in-person'])
  mode!: 'online' | 'in-person';

  @IsString()
  @MinLength(1, { message: 'Reason is required' })
  reason!: string;
}
