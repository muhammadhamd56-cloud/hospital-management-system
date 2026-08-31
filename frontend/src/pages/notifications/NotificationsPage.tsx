import { useMemo } from 'react'
import { BellOff } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/datetime'
import { useNotificationActions } from '@/features/notifications/useNotificationActions'
import { NOTIFICATION_TYPE_ICONS } from '@/features/notifications/notificationIcons'
import type { AppNotification, NotificationType } from '@/types/notification'

type Category = 'all' | 'unread' | 'messages' | 'appointments' | 'billing'

const CATEGORY_TYPES: Record<Exclude<Category, 'all' | 'unread'>, NotificationType[]> = {
  messages: ['chat_message'],
  appointments: ['appointment_booked', 'appointment_cancelled', 'appointment_reminder'],
  billing: ['invoice_created', 'payment_received'],
}

function matchesCategory(notification: AppNotification, category: Category): boolean {
  if (category === 'all') return true
  if (category === 'unread') return !notification.isRead
  return CATEGORY_TYPES[category].includes(notification.type)
}

const CATEGORIES: Category[] = ['all', 'unread', 'messages', 'appointments', 'billing']

export function NotificationsPage() {
  const { notifications, unreadCount, isLoading, handleNotificationClick, handleMarkAllRead } =
    useNotificationActions()

  const byCategory = useMemo(() => {
    const result = {} as Record<Category, AppNotification[]>
    for (const category of CATEGORIES) {
      result[category] = notifications.filter((notification) => matchesCategory(notification, category))
    }
    return result
  }, [notifications])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
          <p className="text-sm text-ink-muted">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <Tabs defaultTab="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {CATEGORIES.map((tab) => {
          const filtered = byCategory[tab]

          return (
          <TabsContent key={tab} value={tab}>
            {!isLoading && filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={BellOff}
                  title="No notifications"
                  description={
                    tab === 'unread' ? "You're all caught up." : 'Nothing here yet.'
                  }
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-surface-border">
                  {filtered.map((notification) => {
                    const Icon = NOTIFICATION_TYPE_ICONS[notification.type]
                    return (
                      <li key={notification.id}>
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={cn(
                            'flex w-full cursor-pointer gap-4 px-5 py-4 text-left hover:bg-surface-alt',
                            !notification.isRead && 'bg-brand-50 dark:bg-brand-500/10',
                          )}
                        >
                          <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                'text-sm text-ink',
                                !notification.isRead ? 'font-semibold' : 'font-medium',
                              )}
                            >
                              {notification.title}
                            </p>
                            <p className="mt-0.5 text-sm text-ink-muted">{notification.body}</p>
                            <p className="mt-1 text-xs text-ink-muted">
                              {formatDateTime(notification.createdAt)}
                            </p>
                          </div>
                          {!notification.isRead && (
                            <span
                              className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-600"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )}
          </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
