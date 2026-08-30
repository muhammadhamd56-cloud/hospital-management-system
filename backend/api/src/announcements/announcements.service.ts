import { Injectable } from '@nestjs/common';
import { AuditAction, NotificationType } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { toAnnouncementResponse, toPrismaAnnouncementPriority, AnnouncementResponse } from './announcement.mapper';

const INCLUDE = { author: { select: { firstName: true, lastName: true } } } as const;
const LIST_LIMIT = 50;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(): Promise<AnnouncementResponse[]> {
    const announcements = await this.prisma.announcement.findMany({
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });

    return announcements.map(toAnnouncementResponse);
  }

  async create(dto: CreateAnnouncementDto, actorId: string): Promise<AnnouncementResponse> {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority ? toPrismaAnnouncementPriority(dto.priority) : undefined,
        authorId: actorId,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'Announcement',
      entityId: announcement.id,
      metadata: { title: announcement.title, priority: announcement.priority },
    });

    // Every staff member with a login account gets notified -- name-only
    // roster entries (no userId) have nowhere to deliver a notification.
    const recipients = await this.prisma.staff.findMany({
      where: { userId: { not: null }, isActive: true },
      select: { userId: true },
    });

    await Promise.all(
      recipients
        .filter((recipient): recipient is { userId: string } => recipient.userId !== null)
        .map((recipient) =>
          this.notifications.create(
            recipient.userId,
            NotificationType.ANNOUNCEMENT_PUBLISHED,
            announcement.title,
            announcement.description,
          ),
        ),
    );

    return toAnnouncementResponse(announcement);
  }
}
