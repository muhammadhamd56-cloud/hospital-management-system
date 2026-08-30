import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateLeaveDto {
  @IsDateString({}, { message: 'Enter a valid date' })
  date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
