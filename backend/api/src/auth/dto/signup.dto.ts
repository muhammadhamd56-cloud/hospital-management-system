import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';
import type { ClientRole } from '../../common/role.mapper';
import { normalizeEmail } from '../../common/normalize-email';

export class SignupDto {
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  firstName!: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  lastName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  // 'admin' is deliberately excluded — admin accounts are provisioned out-of-band,
  // never through self-signup.
  @IsIn(['doctor', 'patient', 'staff'])
  role!: ClientRole;

  // Only required/validated when role is 'doctor' -- see AuthService.signupLocal.
  @ValidateIf((dto: SignupDto) => dto.role === 'doctor')
  @IsString()
  @MinLength(1, { message: 'Specialization is required' })
  specialization?: string;

  @ValidateIf((dto: SignupDto) => dto.role === 'doctor')
  @IsString()
  @MinLength(1, { message: 'Department is required' })
  department?: string;

  @ValidateIf((dto: SignupDto) => dto.role === 'doctor')
  @IsString()
  @MinLength(1, { message: 'Bio is required' })
  bio?: string;

  @ValidateIf((dto: SignupDto) => dto.role === 'doctor')
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(80, { message: 'Enter a valid number of years' })
  experienceYears?: number;
}
