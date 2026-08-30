import { IsDateString, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { TIME_OF_DAY_PATTERN } from './create-template.dto';

export type ClientShiftType = 'morning' | 'evening' | 'night' | 'custom';

export type ClientShiftStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'absent';

export const SHIFT_TYPES: ClientShiftType[] = ['morning', 'evening', 'night', 'custom'];

export const SHIFT_STATUSES: ClientShiftStatus[] = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'absent',
];

export class CreateShiftDto {
  @IsString()
  @MinLength(1, { message: 'Staff member is required' })
  staffId!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsDateString({}, { message: 'Enter a valid start time' })
  startTime!: string;

  @IsDateString({}, { message: 'Enter a valid end time' })
  endTime!: string;

  /**
   * The admin's local calendar date and local wall-clock start time, sent
   * alongside the resolved UTC startTime/endTime instants above. The
   * backend uses these -- not a UTC-derived approximation -- for
   * day-of-week/leave lookups and the availability-hours comparison, since
   * only the browser knows the admin's timezone offset.
   */
  @IsDateString({}, { message: 'Enter a valid date' })
  date!: string;

  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid start time (HH:mm)' })
  localStartTime!: string;

  @IsIn(SHIFT_TYPES)
  shiftType!: ClientShiftType;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Ties multiple staff assigned to what the UI presents as "the same
   *  shift" (e.g. an Emergency Night Shift covered by 4 people) together
   *  for display -- each staff member still gets their own row/validation. */
  @IsOptional()
  @IsString()
  groupId?: string;
}
