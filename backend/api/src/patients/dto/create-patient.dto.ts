import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';
import { IsE164PhoneNumber } from '../../common/validators/is-e164-phone-number.validator';

export class CreatePatientDto {
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  firstName!: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  lastName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsOptional()
  @IsString()
  @IsE164PhoneNumber()
  phone?: string;
}
