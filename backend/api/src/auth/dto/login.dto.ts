import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import type { ClientRole } from '../../common/role.mapper';
import { normalizeEmail } from '../../common/normalize-email';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;

  @IsIn(['admin', 'doctor', 'patient'])
  role!: ClientRole;
}
