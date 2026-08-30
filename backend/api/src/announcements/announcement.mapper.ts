import { AnnouncementPriority } from '@prisma/client';
import type { Announcement, User } from '@prisma/client';
import type { ClientAnnouncementPriority } from './dto/create-announcement.dto';

const CLIENT_TO_PRISMA_PRIORITY: Record<ClientAnnouncementPriority, AnnouncementPriority> = {
  normal: AnnouncementPriority.NORMAL,
  important: AnnouncementPriority.IMPORTANT,
  urgent: AnnouncementPriority.URGENT,
};

const PRISMA_TO_CLIENT_PRIORITY: Record<AnnouncementPriority, ClientAnnouncementPriority> = {
  [AnnouncementPriority.NORMAL]: 'normal',
  [AnnouncementPriority.IMPORTANT]: 'important',
  [AnnouncementPriority.URGENT]: 'urgent',
};

export function toPrismaAnnouncementPriority(priority: ClientAnnouncementPriority): AnnouncementPriority {
  return CLIENT_TO_PRISMA_PRIORITY[priority];
}

export function toClientAnnouncementPriority(priority: AnnouncementPriority): ClientAnnouncementPriority {
  return PRISMA_TO_CLIENT_PRIORITY[priority];
}

export interface AnnouncementResponse {
  id: string;
  title: string;
  description: string;
  priority: ClientAnnouncementPriority;
  authorName: string | null;
  createdAt: string;
}

export type AnnouncementWithAuthor = Announcement & { author: Pick<User, 'firstName' | 'lastName'> | null };

export function toAnnouncementResponse(announcement: AnnouncementWithAuthor): AnnouncementResponse {
  return {
    id: announcement.id,
    title: announcement.title,
    description: announcement.description,
    priority: toClientAnnouncementPriority(announcement.priority),
    authorName: announcement.author ? `${announcement.author.firstName} ${announcement.author.lastName}`.trim() : null,
    createdAt: announcement.createdAt.toISOString(),
  };
}
