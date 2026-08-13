import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('create', () => {
    it('creates a notification row for the given user', async () => {
      await service.create('user-1', NotificationType.CHAT_MESSAGE, 'Title', 'Body', '/link');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', type: NotificationType.CHAT_MESSAGE, title: 'Title', body: 'Body', link: '/link' },
      });
    });
  });

  describe('list', () => {
    it('returns the most recent notifications and the unread count', async () => {
      const rows = [
        {
          id: 'n1',
          userId: 'user-1',
          type: NotificationType.CHAT_MESSAGE,
          title: 'Title',
          body: 'Body',
          link: null,
          isRead: false,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ];
      prisma.notification.findMany.mockResolvedValue(rows);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.list('user-1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result.unreadCount).toBe(1);
      expect(result.notifications).toEqual([
        {
          id: 'n1',
          type: 'chat_message',
          title: 'Title',
          body: 'Body',
          link: null,
          isRead: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('markRead', () => {
    it('throws NotFoundException when the notification does not belong to the user', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'someone-else' });

      await expect(service.markRead('user-1', 'n1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('marks a notification read when it belongs to the user', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'user-1' });
      prisma.notification.update.mockResolvedValue({
        id: 'n1',
        userId: 'user-1',
        type: NotificationType.APPOINTMENT_BOOKED,
        title: 'Title',
        body: 'Body',
        link: null,
        isRead: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = await service.markRead('user-1', 'n1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { isRead: true },
      });
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('marks every unread notification for the user as read', async () => {
      await service.markAllRead('user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      });
    });
  });
});
