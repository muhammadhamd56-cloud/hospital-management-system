import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/features/auth/useAuth'
import type { AppNotification } from '@/types/notification'
import type { Role } from '@/types/role'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/features/notifications/api'

/**
 * Only used for a notification with no `link` -- e.g. one created before
 * server-side navigation links existed, which has no specific resource id
 * to deep-link to. Falls back to the right section instead of doing
 * nothing when clicked. Anything with a real `link` (every notification
 * created from now on) always opens the exact resource instead.
 */
function fallbackRoute(type: AppNotification['type'], role: Role | undefined): string | null {
  switch (type) {
    case 'chat_message':
      return ROUTES.messages
    case 'appointment_booked':
    case 'appointment_cancelled':
      return role === 'patient' ? ROUTES.myAppointments : ROUTES.appointments
    case 'appointment_reminder':
      return ROUTES.myAppointments
    case 'medical_record_added':
      return ROUTES.medicalRecords
    case 'lab_result_ready':
      return role === 'patient' ? ROUTES.medicalRecords : ROUTES.laboratory
    case 'shift_scheduled':
    case 'shift_updated':
    case 'shift_cancelled':
    case 'shift_application_approved':
      return ROUTES.myShifts
    case 'shift_application_rejected':
      return ROUTES.availableShifts
    case 'task_assigned':
    case 'task_due_soon':
    case 'task_overdue':
      return ROUTES.myTasks
    case 'announcement_published':
      return ROUTES.announcements
    case 'invoice_created':
    case 'payment_received':
      return ROUTES.billing
    default:
      return null
  }
}

/** Centralizes notification list state, mark-as-read, and click-to-navigate
 *  behavior so NotificationBell and the full Notifications page share one
 *  implementation instead of duplicating it. */
export function useNotificationActions() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const { user } = useAuth()

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

    const destination = notification.link ?? fallbackRoute(notification.type, user?.role)
    if (destination) {
      navigate(destination)
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
