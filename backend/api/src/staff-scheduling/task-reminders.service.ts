import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How far ahead of a task's due time the "due soon" nudge goes out. */
const DUE_SOON_LEAD_HOURS = 2;

const TASK_INCLUDE = { assignedTo: { select: { userId: true } } } as const;

/**
 * Periodically nudges staff about tasks due soon, and separately flags ones
 * that just went overdue. reminderSentAt/overdueNotifiedAt each gate their
 * own one-time notification regardless of how often the cron fires --
 * same pattern as AppointmentRemindersService.
 */
@Injectable()
export class TaskRemindersService {
  private readonly logger = new Logger(TaskRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleDueTasks(): Promise<void> {
    await this.sendDueSoonNudges();
    await this.sendOverdueNotices();
  }

  async sendDueSoonNudges(): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + DUE_SOON_LEAD_HOURS * 60 * 60 * 1000);

    const dueSoon = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.COMPLETED },
        reminderSentAt: null,
        dueAt: { gt: now, lte: windowEnd },
      },
      include: TASK_INCLUDE,
    });

    let sent = 0;
    for (const task of dueSoon) {
      try {
        if (task.assignedTo.userId) {
          await this.notifications.create(
            task.assignedTo.userId,
            NotificationType.TASK_DUE_SOON,
            'Task due soon',
            `"${task.title}" is due ${task.dueAt.toLocaleString()}.`,
          );
        }

        await this.prisma.task.update({ where: { id: task.id }, data: { reminderSentAt: new Date() } });
        sent += 1;
      } catch (error) {
        this.logger.error(`Failed to send due-soon nudge for task ${task.id}: ${(error as Error).message}`);
      }
    }

    return sent;
  }

  async sendOverdueNotices(): Promise<number> {
    const now = new Date();

    const overdue = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.COMPLETED },
        overdueNotifiedAt: null,
        dueAt: { lt: now },
      },
      include: TASK_INCLUDE,
    });

    let sent = 0;
    for (const task of overdue) {
      try {
        if (task.assignedTo.userId) {
          await this.notifications.create(
            task.assignedTo.userId,
            NotificationType.TASK_OVERDUE,
            'Task overdue',
            `"${task.title}" was due ${task.dueAt.toLocaleString()}.`,
          );
        }

        await this.prisma.task.update({ where: { id: task.id }, data: { overdueNotifiedAt: new Date() } });
        sent += 1;
      } catch (error) {
        this.logger.error(`Failed to send overdue notice for task ${task.id}: ${(error as Error).message}`);
      }
    }

    return sent;
  }
}
