import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatSessionTime } from '@/features/patientDashboard/formatSession'
import { cn } from '@/utils/cn'
import type { DoctorAppointment } from '@/types/doctorSession'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface SessionCalendarProps {
  appointments: DoctorAppointment[]
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

type DayStatus = 'upcoming' | 'cancelled' | 'past'

function dayStatus(dayAppointments: DoctorAppointment[]): DayStatus | null {
  if (dayAppointments.length === 0) return null

  if (
    dayAppointments.some(
      (appointment) =>
        appointment.status === 'scheduled' &&
        new Date(appointment.scheduledAt).getTime() >= Date.now(),
    )
  ) {
    return 'upcoming'
  }

  if (dayAppointments.some((appointment) => appointment.status === 'cancelled')) {
    return 'cancelled'
  }

  return 'past'
}

const DOT_CLASSES: Record<DayStatus, string> = {
  upcoming: 'bg-brand-500',
  cancelled: 'bg-danger-500',
  past: 'bg-ink-muted/50',
}

export function SessionCalendar({ appointments }: SessionCalendarProps) {
  const today = useMemo(() => new Date(), [])
  const [viewedMonth, setViewedMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [selectedDate, setSelectedDate] = useState<Date>(today)

  const byDate = useMemo(() => {
    const map = new Map<string, DoctorAppointment[]>()
    for (const appointment of appointments) {
      const key = dateKey(new Date(appointment.scheduledAt))
      const list = map.get(key) ?? []
      list.push(appointment)
      map.set(key, list)
    }
    return map
  }, [appointments])

  const year = viewedMonth.getFullYear()
  const month = viewedMonth.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  const selectedAppointments = byDate.get(dateKey(selectedDate)) ?? []
  const sortedSelected = [...selectedAppointments].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Calendar</CardTitle>
        <CardDescription>Upcoming and past bookings by day.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewedMonth(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <p className="text-sm font-medium text-ink">
            {viewedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <button
            type="button"
            onClick={() => setViewedMonth(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-muted">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, index) => {
            if (!date) return <div key={`blank-${index}`} />

            const status = dayStatus(byDate.get(dateKey(date)) ?? [])
            const isSelected = dateKey(date) === dateKey(selectedDate)
            const isToday = dateKey(date) === dateKey(today)

            return (
              <button
                key={dateKey(date)}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-sm transition-colors',
                  isSelected
                    ? 'bg-brand-600 text-white'
                    : isToday
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'text-ink hover:bg-surface-alt',
                )}
              >
                {date.getDate()}
                <span
                  className={cn('size-1.5 rounded-full', status ? DOT_CLASSES[status] : 'bg-transparent')}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>

        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="mb-2 text-sm font-medium text-ink">
            {selectedDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          {sortedSelected.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No bookings on this day" />
          ) : (
            <ul className="divide-y divide-surface-border">
              {sortedSelected.map((appointment) => (
                <li key={appointment.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {appointment.patientName}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatSessionTime(appointment.scheduledAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      appointment.status === 'cancelled'
                        ? 'danger'
                        : appointment.status === 'completed'
                          ? 'neutral'
                          : 'brand'
                    }
                  >
                    {appointment.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
