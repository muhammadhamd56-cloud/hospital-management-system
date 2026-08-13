import { api } from '@/lib/apiClient'
import type { AppNotification } from '@/types/notification'

export function listNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  return api.get('/notifications')
}

export function markNotificationRead(id: string): Promise<{ notification: AppNotification }> {
  return api.patch(`/notifications/${id}/read`)
}

export function markAllNotificationsRead(): Promise<void> {
  return api.patch('/notifications/read-all')
}
