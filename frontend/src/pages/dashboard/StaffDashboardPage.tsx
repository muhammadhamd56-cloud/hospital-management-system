import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CalendarPlus, ClipboardList, Megaphone } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { TaskStatusBadge } from '@/features/staffPortal/TaskStatusBadge'
import { ShiftStatusBadge } from '@/features/staffScheduling/ShiftStatusBadge'
import { listMyShifts, listMyTasks } from '@/features/staffPortal/api'
import { listAnnouncements } from '@/features/announcements/api'
import { useAuth } from '@/features/auth/useAuth'
import { ROUTES } from '@/constants/routes'
import type { Shift } from '@/types/staffScheduling'
import type { Announcement, Task } from '@/types/staffPortal'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function StaffDashboardPage() {
  const { user } = useAuth()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([listMyShifts(), listMyTasks(), listAnnouncements()])
      .then(([shiftsRes, tasksRes, announcementsRes]) => {
        setShifts(shiftsRes.shifts)
        setTasks(tasksRes.tasks)
        setAnnouncements(announcementsRes.announcements)
      })
      .catch(() => {
        // Widgets degrade gracefully to empty states below.
      })
      .finally(() => setIsLoading(false))
  }, [])

  const nextShift = useMemo(() => {
    const now = Date.now()
    return shifts
      .filter((shift) => new Date(shift.startTime).getTime() > now && shift.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
  }, [shifts])

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status !== 'completed').sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    [tasks],
  )
  const overdueCount = useMemo(() => tasks.filter((task) => task.status === 'overdue').length, [tasks])

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Welcome back, {user?.fullName}</h1>
        <p className="text-sm text-ink-muted">Here&apos;s what&apos;s on your schedule.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Upcoming shifts" value={String(shifts.filter((s) => new Date(s.startTime).getTime() > Date.now()).length)} icon={CalendarClock} />
        <StatCard label="Open tasks" value={String(openTasks.length)} icon={ClipboardList} />
        <StatCard label="Overdue tasks" value={String(overdueCount)} icon={ClipboardList} />
        <StatCard label="Announcements" value={String(announcements.length)} icon={Megaphone} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Next shift</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-surface-alt" />
            ) : nextShift ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">{formatDateTime(nextShift.startTime)}</p>
                  <p className="text-sm text-ink-muted">{nextShift.department ?? 'No department'}</p>
                </div>
                <ShiftStatusBadge status={nextShift.status} />
              </div>
            ) : (
              <EmptyState icon={CalendarPlus} title="No upcoming shifts" description="Browse available shifts to pick up a new one." />
            )}
            <Link to={ROUTES.myShifts} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              View all shifts
            </Link>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <CardHeader>
            <CardTitle>Tasks due soon</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-surface-alt" />
            ) : openTasks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Nothing due" description="You're all caught up." />
            ) : (
              <ul className="flex flex-col gap-3">
                {openTasks.slice(0, 4).map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                      <p className="text-xs text-ink-muted">Due {formatDateTime(task.dueAt)}</p>
                    </div>
                    <TaskStatusBadge status={task.status} />
                  </li>
                ))}
              </ul>
            )}
            <Link to={ROUTES.myTasks} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              View all tasks
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: '120ms' }}>
        <CardHeader>
          <CardTitle>Latest announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-lg bg-surface-alt" />
          ) : announcements.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements" description="Hospital-wide updates will show up here." />
          ) : (
            <ul className="flex flex-col gap-3">
              {announcements.slice(0, 3).map((announcement) => (
                <li key={announcement.id}>
                  <p className="text-sm font-medium text-ink">{announcement.title}</p>
                  <p className="line-clamp-1 text-xs text-ink-muted">{announcement.description}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to={ROUTES.announcements} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            View all announcements
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
