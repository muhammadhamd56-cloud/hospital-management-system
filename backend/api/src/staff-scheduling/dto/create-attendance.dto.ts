import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export type ClientAttendanceStatus = 'scheduled' | 'present' | 'late' | 'absent' | 'leave';

export const CLIENT_ATTENDANCE_STATUSES: ClientAttendanceStatus[] = [
  'scheduled',
  'present',
  'late',
  'absent',
  'leave',
];

export class CreateAttendanceDto {
  @IsString()
  @MinLength(1, { message: 'Shift is required' })
  shiftId!: string;

  @IsIn(CLIENT_ATTENDANCE_STATUSES)
  status!: ClientAttendanceStatus;

  @IsOptional()
  @IsISO8601({}, { message: 'Enter a valid check-in time' })
  checkIn?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Enter a valid check-out time' })
  checkOut?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
