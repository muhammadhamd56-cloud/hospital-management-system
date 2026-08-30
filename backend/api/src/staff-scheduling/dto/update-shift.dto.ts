import { IsDateString, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ClientShiftStatus, ClientShiftType, SHIFT_STATUSES, SHIFT_TYPES } from './create-shift.dto';
import { TIME_OF_DAY_PATTERN } from './create-template.dto';

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Staff member is required' })
  staffId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid start time' })
  startTime?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid end time' })
  endTime?: string;

  /** Required alongside startTime whenever the schedule actually changes --
   *  see CreateShiftDto for why. */
  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid date' })
  date?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid start time (HH:mm)' })
  localStartTime?: string;

  @IsOptional()
  @IsIn(SHIFT_TYPES)
  shiftType?: ClientShiftType;

  @IsOptional()
  @IsIn(SHIFT_STATUSES)
  status?: ClientShiftStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
