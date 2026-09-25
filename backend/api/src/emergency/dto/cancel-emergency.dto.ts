import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelEmergencyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
