import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class DoctorProfileDto {
  @IsString()
  @MinLength(1, { message: 'Specialization is required' })
  specialization!: string;

  /** Free-text credentials, e.g. "MBBS, FCPS". Optional -- not every doctor has filled this in yet. */
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Qualifications is too long' })
  qualifications?: string;

  @IsString()
  @MinLength(1, { message: 'Department is required' })
  department!: string;

  @IsString()
  @MinLength(1, { message: 'Bio is required' })
  bio!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Experience must be 0 or more' })
  @Max(80)
  experienceYears!: number;

  /** Charged to a patient as an invoice when they book a session with this doctor. 0 = no charge. */
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Consultation fee must be 0 or more' })
  @Max(100_000, { message: 'Enter a realistic consultation fee' })
  consultationFee!: number;

  /** Informational only -- not used to generate bookable time slots. */
  @Type(() => Number)
  @IsInt()
  @Min(5, { message: 'Appointment duration must be at least 5 minutes' })
  @Max(240, { message: 'Appointment duration must be 240 minutes or less' })
  appointmentDurationMinutes!: number;
}
