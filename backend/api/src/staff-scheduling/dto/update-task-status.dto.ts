import { IsIn } from 'class-validator';

export type ClientTaskStatus = 'pending' | 'in_progress' | 'completed';

export const TASK_STATUSES: ClientTaskStatus[] = ['pending', 'in_progress', 'completed'];

export class UpdateTaskStatusDto {
  @IsIn(TASK_STATUSES)
  status!: ClientTaskStatus;
}
