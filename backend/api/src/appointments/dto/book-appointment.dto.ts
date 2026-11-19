import { IsIn, IsISO8601, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BookAppointmentDto {
  @IsString()
  @MinLength(1, { message: 'Doctor is required' })
  doctorId!: string;

  /** Must carry an explicit offset (Z or ±hh:mm). A bare local time would be
   *  read in the server's timezone (UTC on Render), silently shifting the
   *  appointment by the patient's UTC offset. */
  @IsString()
  @MinLength(1, { message: 'Date and time are required' })
  @IsISO8601({ strict: true }, { message: 'Date and time must be an ISO-8601 timestamp' })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'Date and time must include a timezone offset' })
  scheduledAt!: string;

  @IsIn(['online', 'in-person'])
  mode!: 'online' | 'in-person';

  @IsString()
  @MinLength(1, { message: 'Reason is required' })
  @MaxLength(1000, { message: 'Reason is too long' })
  reason!: string;
}
