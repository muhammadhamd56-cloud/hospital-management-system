import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ClientShiftType, SHIFT_TYPES } from './create-shift.dto';

export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateTemplateDto {
  @IsString()
  @MinLength(1, { message: 'Template name is required' })
  name!: string;

  @IsIn(SHIFT_TYPES)
  shiftType!: ClientShiftType;

  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid start time (HH:mm)' })
  startTime!: string;

  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid end time (HH:mm)' })
  endTime!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
