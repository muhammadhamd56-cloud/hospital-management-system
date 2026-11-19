import { IsIn, IsOptional } from 'class-validator';
import { OptionalQueryDate } from '../../common/validators/query-fields';
import { SHIFT_STATUSES, type ClientShiftStatus } from '../../staff-scheduling/dto/create-shift.dto';
import { TASK_DISPLAY_STATUSES } from '../../staff-scheduling/dto/list-queries.dto';
import type { TaskDisplayStatus } from '../../staff-scheduling/tasks.mapper';

/** GET /staff-portal/shifts -- the caller's own shifts; staffId is never
 *  accepted here (it's resolved from the JWT). */
export class MyShiftsQueryDto {
  @IsOptional()
  @IsIn(SHIFT_STATUSES)
  status?: ClientShiftStatus;

  @OptionalQueryDate()
  dateFrom?: string;

  @OptionalQueryDate()
  dateTo?: string;
}

/** GET /staff-portal/tasks */
export class MyTasksQueryDto {
  @IsOptional()
  @IsIn(TASK_DISPLAY_STATUSES)
  status?: TaskDisplayStatus;
}
