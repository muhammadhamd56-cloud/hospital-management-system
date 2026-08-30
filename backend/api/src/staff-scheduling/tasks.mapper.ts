import { TaskPriority, TaskStatus } from '@prisma/client';
import type { Department, Task } from '@prisma/client';
import type { ClientTaskPriority } from './dto/create-task.dto';
import { StaffResponse, StaffWithUser, toStaffResponse } from './staff.mapper';

const CLIENT_TO_PRISMA_PRIORITY: Record<ClientTaskPriority, TaskPriority> = {
  low: TaskPriority.LOW,
  medium: TaskPriority.MEDIUM,
  high: TaskPriority.HIGH,
  urgent: TaskPriority.URGENT,
};

const PRISMA_TO_CLIENT_PRIORITY: Record<TaskPriority, ClientTaskPriority> = {
  [TaskPriority.LOW]: 'low',
  [TaskPriority.MEDIUM]: 'medium',
  [TaskPriority.HIGH]: 'high',
  [TaskPriority.URGENT]: 'urgent',
};

export function toPrismaTaskPriority(priority: ClientTaskPriority): TaskPriority {
  return CLIENT_TO_PRISMA_PRIORITY[priority];
}

export function toClientTaskPriority(priority: TaskPriority): ClientTaskPriority {
  return PRISMA_TO_CLIENT_PRIORITY[priority];
}

/** "overdue" is derived here (dueAt in the past, not completed) -- never
 *  stored, so it can't drift out of sync the way a cron-maintained column
 *  could. Same convention as Invoice's paid/pending/overdue. */
export type TaskDisplayStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

function toClientTaskStatus(task: Task): TaskDisplayStatus {
  if (task.status === TaskStatus.COMPLETED) return 'completed';
  if (task.dueAt.getTime() < Date.now()) return 'overdue';
  return task.status === TaskStatus.IN_PROGRESS ? 'in_progress' : 'pending';
}

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  priority: ClientTaskPriority;
  department: string | null;
  assignedTo: StaffResponse;
  assignedById: string | null;
  status: TaskDisplayStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskWithRelations = Task & { assignedTo: StaffWithUser; department: Department | null };

export function toTaskResponse(task: TaskWithRelations): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt.toISOString(),
    priority: toClientTaskPriority(task.priority),
    department: task.department?.name ?? null,
    assignedTo: toStaffResponse(task.assignedTo),
    assignedById: task.assignedById,
    status: toClientTaskStatus(task),
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
