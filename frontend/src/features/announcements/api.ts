import { api } from '@/lib/apiClient'
import type { Announcement, AnnouncementPriority } from '@/types/staffPortal'

export function listAnnouncements(): Promise<{ announcements: Announcement[] }> {
  return api.get('/announcements')
}

export interface CreateAnnouncementInput {
  title: string
  description: string
  priority?: AnnouncementPriority
}

export function createAnnouncement(input: CreateAnnouncementInput): Promise<{ announcement: Announcement }> {
  return api.post('/announcements', input)
}
