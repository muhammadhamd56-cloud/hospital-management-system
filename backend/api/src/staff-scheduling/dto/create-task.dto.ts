import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type ClientTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_PRIORITIES: ClientTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export class CreateTaskDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString({}, { message: 'Enter a valid due date/time' })
  dueAt!: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: ClientTaskPriority;

  @IsOptional()
  @IsString()
  department?: string;

  @IsString()
  @MinLength(1, { message: 'Assignee is required' })
  assignedToId!: string;
}
