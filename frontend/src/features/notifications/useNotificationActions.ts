import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { ApiError } from '@/lib/apiClient'
import type { AppNotification } from '@/types/notification'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/features/notifications/api'

/** Centralizes notification list state, mark-as-read, and click-to-navigate
 *  behavior so NotificationBell and the full Notifications page share one
 *  implementation instead of duplicating it. */
export function useNotificationActions() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  /** `silent: true` for background/polling refreshes, which shouldn't
   *  interrupt the user with a toast; omit it for a user-initiated refresh
   *  (e.g. opening the bell dropdown) where a failure should be surfaced. */
  function refresh(options: { silent?: boolean } = {}) {
    setIsLoading(true)
    listNotifications()
      .then((res) => {
        setNotifications(res.notifications)
        setUnreadCount(res.unreadCount)
      })
      .catch((error) => {
        if (options.silent) return
        const message = error instanceof ApiError ? error.message : 'Failed to load notifications'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh({ silent: true })
  }, [])

  /** Marks only the clicked notification read (never the others) and
   *  navigates to its target. A read notification still navigates when
   *  clicked -- it's only "mark as read" that's skipped once already read. */
  async function handleNotificationClick(notification: AppNotification, onBeforeNavigate?: () => void) {
    if (!notification.isRead) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))

      try {
        await markNotificationRead(notification.id)
      } catch {
        refresh()
      }
    }

    onBeforeNavigate?.()

    if (notification.link) {
      navigate(notification.link)
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
    setUnreadCount(0)

    try {
      await markAllNotificationsRead()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update notifications'
      toast.error(message)
      refresh()
    }
  }

  return { notifications, unreadCount, isLoading, refresh, handleNotificationClick, handleMarkAllRead }
}
