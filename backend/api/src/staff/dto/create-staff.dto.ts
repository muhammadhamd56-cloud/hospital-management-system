import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

/** Roles an admin may provision directly. Never 'admin' (out-of-band only)
 *  or 'patient' (self-registers). */
export type StaffRole = 'doctor' | 'receptionist' | 'lab_staff' | 'pharmacist';

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

  @IsIn(['doctor', 'receptionist', 'lab_staff', 'pharmacist'])
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
}
