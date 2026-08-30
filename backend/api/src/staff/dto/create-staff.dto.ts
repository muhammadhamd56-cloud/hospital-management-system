import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

/** Roles an admin may provision directly. Never 'admin' (out-of-band only)
 *  or 'patient' (self-registers). 'staff' covers every non-doctor staff
 *  member -- nurse, receptionist, pharmacist, lab technician, other -- which
 *  specific one they are is set later via their Staff.staffType on the
 *  scheduling roster, not here. */
export type StaffRole = 'doctor' | 'staff';

export class CreateStaffDto {
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  firstName!: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  lastName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsIn(['doctor', 'staff'])
  role!: StaffRole;

  // Only required/validated when role is 'doctor' -- see StaffService.create.
  @ValidateIf((dto: CreateStaffDto) => dto.role === 'doctor')
  @IsString()
  @MinLength(1, { message: 'Specialization is required' })
  specialization?: string;

  @ValidateIf((dto: CreateStaffDto) => dto.role === 'doctor')
  @IsString()
  @MinLength(1, { message: 'Department is required' })
  department?: string;

  @ValidateIf((dto: CreateStaffDto) => dto.role === 'doctor')
  @IsString()
  @MinLength(1, { message: 'Bio is required' })
  bio?: string;

  @ValidateIf((dto: CreateStaffDto) => dto.role === 'doctor')
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(80, { message: 'Enter a valid number of years' })
  experienceYears?: number;

  // Optional even for a doctor -- defaults to 0 (no charge) until the admin
  // or the doctor themself sets it via their profile.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Consultation fee must be 0 or more' })
  consultationFee?: number;
}
