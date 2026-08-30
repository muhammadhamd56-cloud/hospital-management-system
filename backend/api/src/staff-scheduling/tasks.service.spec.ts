import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffType, TaskPriority, TaskStatus, type Task } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateTaskDto } from './dto/create-task.dto';

const ACTOR_ID = 'admin-1';
const USER_ID = 'nurse-user-1';
const STAFF_ID = 'staff-1';

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Check assigned patients',
    description: null,
    dueAt: new Date(Date.now() + 60 * 60 * 1000),
    priority: TaskPriority.MEDIUM,
    departmentId: null,
    assignedToId: STAFF_ID,
    assignedById: ACTOR_ID,
    status: TaskStatus.PENDING,
    completedAt: null,
    reminderSentAt: null,
    overdueNotifiedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

const staffWithUser = {
  id: STAFF_ID,
  staffType: StaffType.NURSE,
  fullName: 'Sara',
  email: null,
  isActive: true,
  userId: USER_ID,
  department: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    task: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    staff: { findUnique: jest.Mock };
    department: { upsert: jest.Mock };
  };
  let auditLog: { log: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      task: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      staff: { findUnique: jest.fn() },
      department: { upsert: jest.fn() },
    };
    auditLog = { log: jest.fn() };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  describe('create', () => {
    const dto: CreateTaskDto = {
      title: 'Check assigned patients',
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      assignedToId: STAFF_ID,
    };

    it('throws NotFoundException when the assignee is not on the roster', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('creates the task and notifies the assignee', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffWithUser);
      prisma.task.create.mockResolvedValue({ ...buildTask(), assignedTo: staffWithUser, department: null });

      const result = await service.create(dto, ACTOR_ID);

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: dto.title, assignedToId: STAFF_ID }) }),
      );
      expect(notifications.create).toHaveBeenCalledWith(USER_ID, 'TASK_ASSIGNED', expect.any(String), expect.any(String));
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'Task' }));
      expect(result.status).toBe('pending');
    });

    it('does not notify when the assignee has no linked login account', async () => {
      prisma.staff.findUnique.mockResolvedValue({ ...staffWithUser, userId: null });
      prisma.task.create.mockResolvedValue({ ...buildTask(), assignedTo: { ...staffWithUser, userId: null }, department: null });

      await service.create(dto, ACTOR_ID);

      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('notifies the new assignee on reassignment and resets reminder stamps', async () => {
      const existing = buildTask({ assignedToId: 'other-staff', reminderSentAt: new Date(), overdueNotifiedAt: new Date() });
      prisma.task.findUnique.mockResolvedValue(existing);
      prisma.staff.findUnique.mockResolvedValue(staffWithUser);
      prisma.task.update.mockResolvedValue({ ...buildTask(), assignedTo: staffWithUser, department: null });

      await service.update('task-1', { assignedToId: STAFF_ID }, ACTOR_ID);

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reminderSentAt: null, overdueNotifiedAt: null }) }),
      );
      expect(notifications.create).toHaveBeenCalledWith(USER_ID, 'TASK_ASSIGNED', expect.any(String), expect.any(String));
    });

    it('does not touch reminder stamps or notify when the assignee is unchanged', async () => {
      const existing = buildTask({ reminderSentAt: new Date('2026-08-01') });
      prisma.task.findUnique.mockResolvedValue(existing);
      prisma.task.update.mockResolvedValue({ ...buildTask(), assignedTo: staffWithUser, department: null });

      await service.update('task-1', { title: 'Updated title' }, ACTOR_ID);

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reminderSentAt: existing.reminderSentAt }) }),
      );
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatusAsOwner', () => {
    it('throws NotFoundException when the caller has no linked staff roster entry', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(service.updateStatusAsOwner(USER_ID, 'task-1', { status: 'completed' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws NotFoundException when the task isn't assigned to the caller (IDOR check)", async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.task.findUnique.mockResolvedValue(buildTask({ assignedToId: 'someone-else' }));

      await expect(service.updateStatusAsOwner(USER_ID, 'task-1', { status: 'completed' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows PENDING -> IN_PROGRESS', async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.task.findUnique.mockResolvedValue(buildTask({ status: TaskStatus.PENDING }));
      prisma.task.update.mockResolvedValue({ ...buildTask({ status: TaskStatus.IN_PROGRESS }), assignedTo: staffWithUser, department: null });

      const result = await service.updateStatusAsOwner(USER_ID, 'task-1', { status: 'in_progress' });

      expect(result.status).toBe('in_progress');
    });

    it('stamps completedAt when marking COMPLETED', async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.task.findUnique.mockResolvedValue(buildTask({ status: TaskStatus.IN_PROGRESS }));
      prisma.task.update.mockResolvedValue({
        ...buildTask({ status: TaskStatus.COMPLETED, completedAt: new Date() }),
        assignedTo: staffWithUser,
        department: null,
      });

      await service.updateStatusAsOwner(USER_ID, 'task-1', { status: 'completed' });

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.COMPLETED, completedAt: expect.any(Date) }) }),
      );
    });

    it('rejects skipping backwards from COMPLETED to PENDING', async () => {
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.task.findUnique.mockResolvedValue(buildTask({ status: TaskStatus.COMPLETED }));

      await expect(service.updateStatusAsOwner(USER_ID, 'task-1', { status: 'pending' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('overdue derivation (toTaskResponse via findAll)', () => {
    it('reports "overdue" for a non-completed task whose dueAt has passed, regardless of stored status', async () => {
      prisma.task.findMany.mockResolvedValue([
        { ...buildTask({ dueAt: new Date(Date.now() - 60 * 60 * 1000), status: TaskStatus.IN_PROGRESS }), assignedTo: staffWithUser, department: null },
      ]);

      const [task] = await service.findAll();

      expect(task.status).toBe('overdue');
    });

    it('reports "completed" even when dueAt has passed, once the task is done', async () => {
      prisma.task.findMany.mockResolvedValue([
        {
          ...buildTask({ dueAt: new Date(Date.now() - 60 * 60 * 1000), status: TaskStatus.COMPLETED, completedAt: new Date() }),
          assignedTo: staffWithUser,
          department: null,
        },
      ]);

      const [task] = await service.findAll();

      expect(task.status).toBe('completed');
    });

    it('filters to only overdue tasks when status=overdue is requested', async () => {
      prisma.task.findMany.mockResolvedValue([
        { ...buildTask({ id: 't1', dueAt: new Date(Date.now() - 1000) }), assignedTo: staffWithUser, department: null },
        { ...buildTask({ id: 't2', dueAt: new Date(Date.now() + 60 * 60 * 1000) }), assignedTo: staffWithUser, department: null },
      ]);

      const result = await service.findAll({ status: 'overdue' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
    });
  });
});
