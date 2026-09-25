import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';
import { IsStrongPassword } from '../password-policy';

export class ResetPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'Enter the 6-digit code' })
  code!: string;

  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
