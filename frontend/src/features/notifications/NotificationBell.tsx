import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { formatDateTime } from '@/utils/datetime'
import { cn } from '@/utils/cn'
import { useNotificationActions } from '@/features/notifications/useNotificationActions'
import { NOTIFICATION_TYPE_ICONS } from '@/features/notifications/notificationIcons'
import { ROUTES } from '@/constants/routes'

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, refresh, handleNotificationClick, handleMarkAllRead } =
    useNotificationActions()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const interval = setInterval(() => refresh({ silent: true }), 30_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!isOpen) refresh()
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
                  const Icon = NOTIFICATION_TYPE_ICONS[notification.type]
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification, () => setIsOpen(false))}
                        className={cn(
                          'flex w-full cursor-pointer gap-3 border-b border-surface-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-alt',
                          !notification.isRead && 'bg-brand-50 dark:bg-brand-500/10',
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-sm text-ink',
                              !notification.isRead ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {notification.title}
                          </p>
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

          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              navigate(ROUTES.notifications)
            }}
            className="block w-full border-t border-surface-border px-4 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-surface-alt hover:underline dark:text-brand-400"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
