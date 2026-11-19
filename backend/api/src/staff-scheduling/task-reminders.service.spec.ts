import { Test, TestingModule } from '@nestjs/testing';
import { TaskStatus } from '@prisma/client';
import { TaskRemindersService } from './task-reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Restock ward B',
    status: TaskStatus.PENDING,
    dueAt: new Date(Date.now() + 60 * 60 * 1000),
    reminderSentAt: null,
    overdueNotifiedAt: null,
    assignedTo: { userId: 'nurse-user-1' },
    ...overrides,
  };
}

type Marker = 'reminderSentAt' | 'overdueNotifiedAt';

describe('TaskRemindersService', () => {
  let service: TaskRemindersService;
  let prisma: { task: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock } };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      task: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TaskRemindersService);
  });

  /** One shared task row whose marker columns only a matching conditional updateMany can set. */
  function useSharedRow(task: ReturnType<typeof buildTask>) {
    const row: Record<Marker, Date | null> = { reminderSentAt: null, overdueNotifiedAt: null };
    prisma.task.findMany.mockImplementation(async () => [task]);
    prisma.task.updateMany.mockImplementation(
      async ({ where, data }: { where: { id: string } & Partial<Record<Marker, null>>; data: Partial<Record<Marker, Date>> }) => {
        const marker = Object.keys(data)[0] as Marker;
        if (where.id !== task.id || !(marker in where) || row[marker] !== null) return { count: 0 };
        row[marker] = data[marker] as Date;
        return { count: 1 };
      },
    );
    return row;
  }

  describe('sendDueSoonNudges', () => {
    it('claims the task (stamping reminderSentAt) before notifying the assignee', async () => {
      prisma.task.findMany.mockResolvedValue([buildTask()]);

      const sent = await service.sendDueSoonNudges();

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', reminderSentAt: null },
        data: { reminderSentAt: expect.any(Date) },
      });
      expect(prisma.task.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        notifications.create.mock.invocationCallOrder[0],
      );
      expect(notifications.create).toHaveBeenCalledWith(
        'nurse-user-1',
        'TASK_DUE_SOON',
        'Task due soon',
        expect.stringContaining('Restock ward B'),
        '/my-tasks?taskId=task-1',
      );
      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(sent).toBe(1);
    });

    it('skips a task another run already claimed', async () => {
      prisma.task.findMany.mockResolvedValue([buildTask()]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.sendDueSoonNudges()).resolves.toBe(0);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('sends only once when two overlapping runs both read the task before either marks it', async () => {
      const row = useSharedRow(buildTask());

      const [first, second] = await Promise.all([service.sendDueSoonNudges(), service.sendDueSoonNudges()]);

      expect(prisma.task.findMany).toHaveBeenCalledTimes(2);
      expect(first + second).toBe(1);
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(row.reminderSentAt).toBeInstanceOf(Date);
    });

    it('still claims (and counts) a task whose assignee has no login, without notifying anyone', async () => {
      prisma.task.findMany.mockResolvedValue([buildTask({ assignedTo: { userId: null } })]);

      await expect(service.sendDueSoonNudges()).resolves.toBe(1);
      expect(prisma.task.updateMany).toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('keeps processing remaining tasks when one fails partway through', async () => {
      prisma.task.findMany.mockResolvedValue([buildTask({ id: 'task-1' }), buildTask({ id: 'task-2' })]);
      notifications.create.mockRejectedValueOnce(new Error('db hiccup')).mockResolvedValueOnce(undefined);

      await expect(service.sendDueSoonNudges()).resolves.toBe(1);
      expect(notifications.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendOverdueNotices', () => {
    it('claims the task (stamping overdueNotifiedAt) before notifying the assignee', async () => {
      prisma.task.findMany.mockResolvedValue([buildTask({ dueAt: new Date(Date.now() - 60 * 60 * 1000) })]);

      const sent = await service.sendOverdueNotices();

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ overdueNotifiedAt: null }) }),
      );
      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', overdueNotifiedAt: null },
        data: { overdueNotifiedAt: expect.any(Date) },
      });
      expect(prisma.task.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        notifications.create.mock.invocationCallOrder[0],
      );
      expect(notifications.create).toHaveBeenCalledWith(
        'nurse-user-1',
        'TASK_OVERDUE',
        'Task overdue',
        expect.any(String),
        '/my-tasks?taskId=task-1',
      );
      expect(sent).toBe(1);
    });

    it('skips a task another run already claimed', async () => {
      prisma.task.findMany.mockResolvedValue([buildTask()]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.sendOverdueNotices()).resolves.toBe(0);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('sends only once when two overlapping runs both read the task before either marks it', async () => {
      const row = useSharedRow(buildTask({ dueAt: new Date(Date.now() - 60 * 60 * 1000) }));

      const [first, second] = await Promise.all([service.sendOverdueNotices(), service.sendOverdueNotices()]);

      expect(first + second).toBe(1);
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(row.overdueNotifiedAt).toBeInstanceOf(Date);
      expect(row.reminderSentAt).toBeNull();
    });
  });
});
