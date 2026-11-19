import { IsIn, IsOptional } from 'class-validator';
import {
  OptionalDepartmentName,
  OptionalEntityId,
  OptionalQueryDate,
} from '../../common/validators/query-fields';
import type { TaskDisplayStatus } from '../tasks.mapper';
import { SHIFT_STATUSES, type ClientShiftStatus } from './create-shift.dto';
import { CLIENT_STAFF_TYPES, type ClientStaffType } from './create-staff.dto';

/*
 * Query-string filters for the staff-scheduling list endpoints. Each field
 * mirrors a parameter the controller already read with @Query('name'), so
 * valid requests behave exactly as before; anything malformed (or any
 * unknown parameter, via forbidNonWhitelisted) is now a 400 instead of
 * reaching Prisma.
 */

export const TASK_DISPLAY_STATUSES: TaskDisplayStatus[] = ['pending', 'in_progress', 'completed', 'overdue'];

/** Mirrors ShiftApplicationFilters['status'] in shift-applications.service.ts. */
export type ClientShiftApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export const SHIFT_APPLICATION_STATUSES: ClientShiftApplicationStatus[] = [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
];

/** GET /staff-scheduling/shifts */
export class ListShiftsQueryDto {
  @OptionalEntityId()
  staffId?: string;

  @OptionalDepartmentName()
  department?: string;

  @IsOptional()
  @IsIn(SHIFT_STATUSES)
  status?: ClientShiftStatus;

  @OptionalQueryDate()
  dateFrom?: string;

  @OptionalQueryDate()
  dateTo?: string;
}

/** GET /staff-scheduling/staff */
export class ListStaffQueryDto {
  @IsOptional()
  @IsIn(CLIENT_STAFF_TYPES)
  staffType?: ClientStaffType;

  @OptionalDepartmentName()
  department?: string;
}

/** GET /staff-scheduling/attendance */
export class ListAttendanceQueryDto {
  @OptionalEntityId()
  staffId?: string;

  @OptionalQueryDate()
  dateFrom?: string;

  @OptionalQueryDate()
  dateTo?: string;
}

/** GET /staff-scheduling/shift-openings -- `isOpen` stays a 'true'/'false'
 *  string; the controller converts it exactly as it did before. */
export class ListShiftOpeningsQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  isOpen?: 'true' | 'false';

  @IsOptional()
  @IsIn(CLIENT_STAFF_TYPES)
  requiredStaffType?: ClientStaffType;

  @OptionalDepartmentName()
  department?: string;
}

/** GET /staff-scheduling/shift-applications */
export class ListShiftApplicationsQueryDto {
  @OptionalEntityId()
  openingId?: string;

  @OptionalEntityId()
  staffId?: string;

  @IsOptional()
  @IsIn(SHIFT_APPLICATION_STATUSES)
  status?: ClientShiftApplicationStatus;
}

/** GET /staff-scheduling/tasks */
export class ListTasksQueryDto {
  @OptionalEntityId()
  assignedToId?: string;

  @OptionalDepartmentName()
  department?: string;

  @IsOptional()
  @IsIn(TASK_DISPLAY_STATUSES)
  status?: TaskDisplayStatus;
}
