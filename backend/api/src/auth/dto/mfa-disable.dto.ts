import { IsString, MinLength } from 'class-validator';

export class MfaDisableDto {
  @IsString()
  @MinLength(1, { message: 'Your current password is required' })
  password!: string;
}
