import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { CLIENT_ATTENDANCE_STATUSES, ClientAttendanceStatus } from './create-attendance.dto';

export class UpdateAttendanceDto {
  @IsOptional()
  @IsIn(CLIENT_ATTENDANCE_STATUSES)
  status?: ClientAttendanceStatus;

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
