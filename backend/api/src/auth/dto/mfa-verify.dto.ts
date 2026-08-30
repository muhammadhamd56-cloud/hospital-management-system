import { IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  mfaToken!: string;

  // 6-digit TOTP code or a 10-character hex backup code.
  @IsString()
  @Length(6, 10, { message: 'Enter a valid code' })
  code!: string;
}
