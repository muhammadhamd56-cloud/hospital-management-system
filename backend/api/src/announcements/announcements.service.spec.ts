import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementPriority, type Announcement } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';

const ACTOR_ID = 'admin-1';

function buildAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'announcement-1',
    title: 'New parking policy',
    description: 'Staff parking moves to Lot B starting Monday.',
    priority: AnnouncementPriority.NORMAL,
    authorId: ACTOR_ID,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: {
    announcement: { findMany: jest.Mock; create: jest.Mock };
    staff: { findMany: jest.Mock };
  };
  let auditLog: { log: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      announcement: { findMany: jest.fn(), create: jest.fn() },
      staff: { findMany: jest.fn() },
    };
    auditLog = { log: jest.fn() };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(AnnouncementsService);
  });

  describe('create', () => {
    const dto: CreateAnnouncementDto = { title: 'New parking policy', description: 'Staff parking moves to Lot B.' };

    it('creates the announcement and logs an audit entry', async () => {
      prisma.announcement.create.mockResolvedValue({ ...buildAnnouncement(), author: { firstName: 'Ada', lastName: 'Admin' } });
      prisma.staff.findMany.mockResolvedValue([]);

      const result = await service.create(dto, ACTOR_ID);

      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'Announcement' }));
      expect(result.title).toBe('New parking policy');
      expect(result.authorName).toBe('Ada Admin');
    });

    it('notifies every active staff member with a linked login account', async () => {
      prisma.announcement.create.mockResolvedValue({ ...buildAnnouncement(), author: null });
      prisma.staff.findMany.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]);

      await service.create(dto, ACTOR_ID);

      const created = buildAnnouncement();
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith('user-1', 'ANNOUNCEMENT_PUBLISHED', created.title, created.description);
      expect(notifications.create).toHaveBeenCalledWith('user-2', 'ANNOUNCEMENT_PUBLISHED', created.title, created.description);
    });

    it('only queries active, login-linked staff -- name-only roster entries have nowhere to be notified', async () => {
      prisma.announcement.create.mockResolvedValue({ ...buildAnnouncement(), author: null });
      prisma.staff.findMany.mockResolvedValue([]);

      await service.create(dto, ACTOR_ID);

      expect(prisma.staff.findMany).toHaveBeenCalledWith({
        where: { userId: { not: null }, isActive: true },
        select: { userId: true },
      });
    });
  });

  describe('findAll', () => {
    it('maps rows to AnnouncementResponse, newest first', async () => {
      prisma.announcement.findMany.mockResolvedValue([{ ...buildAnnouncement(), author: { firstName: 'Ada', lastName: 'Admin' } }]);

      const result = await service.findAll();

      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
      expect(result[0]).toMatchObject({ title: 'New parking policy', authorName: 'Ada Admin', priority: 'normal' });
    });
  });
});
