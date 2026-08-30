import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, NotificationType, TaskStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ClientTaskStatus, UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { toPrismaTaskPriority, toTaskResponse, TaskResponse, TaskDisplayStatus } from './tasks.mapper';

const INCLUDE = { assignedTo: { include: { user: true, department: true } }, department: true } as const;

const CLIENT_TO_PRISMA_STATUS: Record<ClientTaskStatus, TaskStatus> = {
  pending: TaskStatus.PENDING,
  in_progress: TaskStatus.IN_PROGRESS,
  completed: TaskStatus.COMPLETED,
};

/** Valid forward-only transitions a task owner can make themselves --
 *  completing is final; nothing un-completes a task once marked done. */
const ALLOWED_SELF_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED],
  [TaskStatus.COMPLETED]: [],
};

export interface TaskFilters {
  assignedToId?: string;
  department?: string;
  status?: TaskDisplayStatus;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- admin ----------

  async findAll(filters: TaskFilters = {}): Promise<TaskResponse[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: filters.assignedToId,
        department: filters.department ? { name: filters.department } : undefined,
        status: filters.status && filters.status !== 'overdue' ? CLIENT_TO_PRISMA_STATUS[filters.status] : undefined,
      },
      include: INCLUDE,
      orderBy: { dueAt: 'asc' },
    });

    const mapped = tasks.map(toTaskResponse);
    // "overdue" is derived, not a DB column -- filter in-memory for that one case.
    return filters.status === 'overdue' ? mapped.filter((task) => task.status === 'overdue') : mapped;
  }

  async create(dto: CreateTaskDto, actorId: string): Promise<TaskResponse> {
    const assignee = await this.prisma.staff.findUnique({ where: { id: dto.assignedToId } });

    if (!assignee) {
      throw new NotFoundException('Assignee not found on the staff roster');
    }

    const departmentId = await this.resolveDepartmentId(dto.department);
    const dueAt = new Date(dto.dueAt);

    if (Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Invalid due date/time');
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        dueAt,
        priority: dto.priority ? toPrismaTaskPriority(dto.priority) : undefined,
        departmentId,
        assignedToId: dto.assignedToId,
        assignedById: actorId,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'Task',
      entityId: task.id,
      metadata: { assignedToId: task.assignedToId, dueAt: task.dueAt },
    });

    if (assignee.userId) {
      await this.notifications.create(
        assignee.userId,
        NotificationType.TASK_ASSIGNED,
        'New task assigned',
        `"${task.title}" is due ${task.dueAt.toLocaleString()}.`,
      );
    }

    return toTaskResponse(task);
  }

  async update(id: string, dto: UpdateTaskDto, actorId: string): Promise<TaskResponse> {
    const existing = await this.prisma.task.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    if (dto.assignedToId) {
      const assignee = await this.prisma.staff.findUnique({ where: { id: dto.assignedToId } });
      if (!assignee) {
        throw new NotFoundException('Assignee not found on the staff roster');
      }
    }

    const departmentId =
      dto.department !== undefined ? await this.resolveDepartmentId(dto.department) : existing.departmentId;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : existing.dueAt;

    if (dto.dueAt && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Invalid due date/time');
    }

    const reassigned = dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedToId;

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title ?? existing.title,
        description: dto.description ?? existing.description,
        dueAt,
        priority: dto.priority ? toPrismaTaskPriority(dto.priority) : existing.priority,
        departmentId,
        assignedToId: dto.assignedToId ?? existing.assignedToId,
        // A reassignment gets a fresh notification window on the new assignee.
        reminderSentAt: reassigned ? null : existing.reminderSentAt,
        overdueNotifiedAt: reassigned ? null : existing.overdueNotifiedAt,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'Task',
      entityId: task.id,
      metadata: { before: existing, reassigned },
    });

    if (reassigned && task.assignedTo.userId) {
      await this.notifications.create(
        task.assignedTo.userId,
        NotificationType.TASK_ASSIGNED,
        'Task assigned to you',
        `"${task.title}" is due ${task.dueAt.toLocaleString()}.`,
      );
    }

    return toTaskResponse(task);
  }

  // ---------- self-service (nurse/staff) ----------

  private async requireLinkedStaff(userId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId } });

    if (!staff) {
      throw new NotFoundException('You are not on the staff roster yet -- ask an admin to add you');
    }

    return staff;
  }

  async findMine(userId: string, filters: Omit<TaskFilters, 'assignedToId'> = {}): Promise<TaskResponse[]> {
    const staff = await this.requireLinkedStaff(userId);
    return this.findAll({ ...filters, assignedToId: staff.id });
  }

  async updateStatusAsOwner(userId: string, taskId: string, dto: UpdateTaskStatusDto): Promise<TaskResponse> {
    const staff = await this.requireLinkedStaff(userId);
    const existing = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (!existing || existing.assignedToId !== staff.id) {
      throw new NotFoundException('Task not found');
    }

    const nextStatus = CLIENT_TO_PRISMA_STATUS[dto.status];

    if (!ALLOWED_SELF_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw new ForbiddenException(`Cannot move a task from ${existing.status} to ${nextStatus}`);
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        completedAt: nextStatus === TaskStatus.COMPLETED ? new Date() : existing.completedAt,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.UPDATE,
      entityType: 'Task',
      entityId: taskId,
      metadata: { before: existing.status, after: nextStatus },
    });

    return toTaskResponse(task);
  }

  private async resolveDepartmentId(name?: string): Promise<string | undefined> {
    if (!name) return undefined;

    const department = await this.prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });

    return department.id;
  }
}
