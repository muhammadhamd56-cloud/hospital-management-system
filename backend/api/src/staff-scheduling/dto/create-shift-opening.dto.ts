import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { CLIENT_STAFF_TYPES, type ClientStaffType } from './create-staff.dto';
import { SHIFT_TYPES, type ClientShiftType } from './create-shift.dto';

export class CreateShiftOpeningDto {
  @IsIn(CLIENT_STAFF_TYPES)
  requiredStaffType!: ClientStaffType;

  @IsOptional()
  @IsString()
  department?: string;

  @IsDateString({}, { message: 'Enter a valid date' })
  date!: string;

  @IsDateString({}, { message: 'Enter a valid start time' })
  startTime!: string;

  @IsDateString({}, { message: 'Enter a valid end time' })
  endTime!: string;

  @IsIn(SHIFT_TYPES)
  shiftType!: ClientShiftType;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'At least one position is required' })
  @Max(50, { message: 'Enter a realistic number of positions' })
  positions!: number;

  @IsDateString({}, { message: 'Enter a valid application deadline' })
  applicationDeadline!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  notes?: string;
}
