import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ClientTaskPriority, TASK_PRIORITIES } from './create-task.dto';

/** Admin-only edit -- reassigning to a different staff member, changing
 *  timing/priority, etc. Status changes go through UpdateTaskStatusDto
 *  instead (that's the one nurses can also call, on their own tasks). */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid due date/time' })
  dueAt?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: ClientTaskPriority;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedToId?: string;
}
