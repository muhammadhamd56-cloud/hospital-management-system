import { IsOptional, IsString } from 'class-validator';
import { IsStrongPassword } from '../../auth/password-policy';

export class SetPasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
