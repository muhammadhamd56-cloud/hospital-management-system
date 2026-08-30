import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateShiftOpeningDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'At least one position is required' })
  @Max(50, { message: 'Enter a realistic number of positions' })
  positions?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid application deadline' })
  applicationDeadline?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  notes?: string;

  /** Lets an admin close an opening to new applications early. */
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
