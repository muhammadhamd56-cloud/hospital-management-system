import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplyShiftDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Keep your message under 500 characters' })
  message?: string;
}
