import { IsString, Length } from 'class-validator';

export class MfaConfirmDto {
  @IsString()
  @Length(6, 6, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string;
}
