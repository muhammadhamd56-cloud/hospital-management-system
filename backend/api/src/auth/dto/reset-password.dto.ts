import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

export class ResetPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'Enter the 6-digit code' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;
}
