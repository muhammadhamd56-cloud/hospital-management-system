import { useEffect, useRef, useState } from 'react'
import { Bell, Calendar, CalendarX, FileText, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDateTime } from '@/utils/datetime'
import { cn } from '@/utils/cn'
import { ApiError } from '@/lib/apiClient'
import type { AppNotification } from '@/types/notification'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/features/notifications/api'

const POLL_INTERVAL_MS = 30_000

const TYPE_ICONS: Record<AppNotification['type'], typeof Bell> = {
  appointment_booked: Calendar,
  appointment_cancelled: CalendarX,
  chat_message: MessageCircle,
  medical_record_added: FileText,
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  function refresh() {
    listNotifications()
      .then((res) => {
        setNotifications(res.notifications)
        setUnreadCount(res.unreadCount)
      })
      .catch(() => {
        // Silent: polling failures shouldn't interrupt the user.
      })
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function handleOpen() {
    setIsOpen((prev) => !prev)
    if (!isOpen) {
      setIsLoading(true)
      listNotifications()
        .then((res) => {
          setNotifications(res.notifications)
          setUnreadCount(res.unreadCount)
        })
        .catch((error) => {
          const message = error instanceof ApiError ? error.message : 'Failed to load notifications'
          toast.error(message)
        })
        .finally(() => setIsLoading(false))
    }
  }

  async function handleNotificationClick(notification: AppNotification) {
    if (notification.isRead) return

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        aria-expanded={isOpen}
        className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-alt"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger-500"
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-card border border-surface-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No notifications yet</p>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const Icon = TYPE_ICONS[notification.type]
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={cn(
                          'flex w-full gap-3 border-b border-surface-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-alt',
                          !notification.isRead && 'bg-brand-50 dark:bg-brand-500/10',
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{notification.title}</p>
                          <p className="line-clamp-2 text-xs text-ink-muted">{notification.body}</p>
                          <p className="mt-1 text-[11px] text-ink-muted">
                            {formatDateTime(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.isRead && (
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
