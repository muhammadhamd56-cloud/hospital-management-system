import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/features/notifications/api'
import { ApiError } from '@/lib/apiClient'
import type { AppNotification } from '@/types/notification'

vi.mock('@/features/notifications/api', () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'chat_message',
    title: 'New message from Dana Doctor',
    body: 'Hello!',
    link: null,
    isRead: false,
    createdAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(listNotifications).mockReset()
  vi.mocked(markNotificationRead).mockReset()
  vi.mocked(markAllNotificationsRead).mockReset()
  vi.mocked(toast.error).mockClear()
})

describe('NotificationBell', () => {
  it('shows no unread dot when there are no unread notifications', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [], unreadCount: 0 })
    render(<NotificationBell />)

    await waitFor(() => expect(listNotifications).toHaveBeenCalled())
    expect(screen.getByLabelText('Notifications').querySelector('span')).toBeNull()
  })

  it('shows an unread dot and opens the dropdown with real notifications on click', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification()],
      unreadCount: 1,
    })
    const user = userEvent.setup()
    render(<NotificationBell />)

    await waitFor(() =>
      expect(screen.getByLabelText('Notifications').querySelector('span')).not.toBeNull(),
    )

    await user.click(screen.getByLabelText('Notifications'))

    expect(await screen.findByText('New message from Dana Doctor')).toBeInTheDocument()
    expect(screen.getByText('Hello!')).toBeInTheDocument()
    expect(screen.getByText('Mark all read')).toBeInTheDocument()
  })

  it('marks a notification read on click and decrements the unread count', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification()],
      unreadCount: 1,
    })
    vi.mocked(markNotificationRead).mockResolvedValue({ notification: notification({ isRead: true }) })
    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(screen.getByLabelText('Notifications'))
    await user.click(await screen.findByText('New message from Dana Doctor'))

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'))
    await waitFor(() => expect(screen.queryByText('Mark all read')).toBeNull())
  })

  it('marks all notifications read via the "Mark all read" action', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification({ id: 'n1' }), notification({ id: 'n2' })],
      unreadCount: 2,
    })
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(screen.getByLabelText('Notifications'))
    await user.click(await screen.findByText('Mark all read'))

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByLabelText('Notifications').querySelector('span')).toBeNull(),
    )
  })

  it('shows an error toast when loading notifications on open fails', async () => {
    vi.mocked(listNotifications)
      .mockResolvedValueOnce({ notifications: [], unreadCount: 0 })
      .mockRejectedValueOnce(new ApiError('Failed to load notifications', { status: 500 }))
    const user = userEvent.setup()
    render(<NotificationBell />)

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(1))
    await user.click(screen.getByLabelText('Notifications'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load notifications'))
  })
})
