import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ClientShiftType, SHIFT_TYPES } from './create-shift.dto';
import { TIME_OF_DAY_PATTERN } from './create-template.dto';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Template name is required' })
  name?: string;

  @IsOptional()
  @IsIn(SHIFT_TYPES)
  shiftType?: ClientShiftType;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid start time (HH:mm)' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid end time (HH:mm)' })
  endTime?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
