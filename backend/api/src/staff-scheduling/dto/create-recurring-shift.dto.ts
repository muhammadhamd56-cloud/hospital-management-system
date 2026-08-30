import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';
import { ClientShiftType, SHIFT_TYPES } from './create-shift.dto';
import { TIME_OF_DAY_PATTERN } from './create-template.dto';

/**
 * Each occurrence's start/end are already-resolved ISO instants computed by
 * the frontend from the admin's local date + local time-of-day (same
 * conversion used for a one-off shift). Generating them client-side avoids
 * the backend guessing the admin's timezone -- which day-of-week a given
 * wall-clock time falls on, and whether a given wall-clock hour is inside
 * an availability window, both depend on that offset, and only the browser
 * knows it. date/localStartTime carry the same local values through
 * unconverted, for the day-of-week/leave/availability-hours checks.
 */
export class RecurringOccurrenceDto {
  @IsDateString({}, { message: 'Enter a valid start time' })
  startTime!: string;

  @IsDateString({}, { message: 'Enter a valid end time' })
  endTime!: string;

  @IsDateString({}, { message: 'Enter a valid date' })
  date!: string;

  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid start time (HH:mm)' })
  localStartTime!: string;
}

export class CreateRecurringShiftDto {
  @IsString()
  @MinLength(1, { message: 'Staff member is required' })
  staffId!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsIn(SHIFT_TYPES)
  shiftType!: ClientShiftType;

  @IsArray()
  @ArrayMinSize(1, { message: 'No matching dates in the selected range' })
  @ValidateNested({ each: true })
  @Type(() => RecurringOccurrenceDto)
  occurrences!: RecurringOccurrenceDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
