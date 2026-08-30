import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ShiftStatusBadge } from '@/features/staffScheduling/ShiftStatusBadge'
import { cn } from '@/utils/cn'
import type { Shift } from '@/types/staffScheduling'

export type CalendarMode = 'day' | 'week' | 'month'

interface CalendarViewProps {
  mode: CalendarMode
  onModeChange: (mode: CalendarMode) => void
  anchorDate: Date
  onAnchorChange: (date: Date) => void
  shifts: Shift[]
  onShiftClick: (shift: Shift) => void
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHIFT_CHIP_COLORS: Record<Shift['shiftType'], string> = {
  morning: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300',
  evening:
    'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-300',
  night: 'border-surface-border bg-surface-alt text-ink dark:border-surface-border',
  custom: 'border-info-200 bg-info-50 text-info-700 dark:border-info-500/30 dark:bg-info-500/15 dark:text-info-300',
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function shiftsOnDay(shifts: Shift[], day: Date): Shift[] {
  return shifts
    .filter((shift) => isSameDay(new Date(shift.startTime), day))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function ShiftChip({ shift, onClick, dense }: { shift: Shift; onClick: () => void; dense?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full truncate rounded-md border px-2 py-1 text-left text-xs transition-opacity hover:opacity-80',
        SHIFT_CHIP_COLORS[shift.shiftType],
      )}
    >
      <span className="block truncate font-medium">{shift.staff.fullName}</span>
      {!dense && (
        <span className="block truncate text-[11px] opacity-80">
          {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
        </span>
      )}
    </button>
  )
}

export function CalendarView({ mode, onModeChange, anchorDate, onAnchorChange, shifts, onShiftClick }: CalendarViewProps) {
  function navigate(direction: 1 | -1) {
    if (mode === 'day') onAnchorChange(addDays(anchorDate, direction))
    else if (mode === 'week') onAnchorChange(addDays(anchorDate, direction * 7))
    else onAnchorChange(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1))
  }

  const heading =
    mode === 'day'
      ? anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : mode === 'week'
        ? `Week of ${startOfWeek(anchorDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <h2 className="min-w-[15rem] text-center text-sm font-semibold text-ink">{heading}</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onAnchorChange(new Date())}>
            Today
          </Button>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-surface-alt p-1">
          {(['day', 'week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onModeChange(option)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                mode === option ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {mode === 'day' && <DayView day={anchorDate} shifts={shifts} onShiftClick={onShiftClick} />}
      {mode === 'week' && <WeekView anchorDate={anchorDate} shifts={shifts} onShiftClick={onShiftClick} />}
      {mode === 'month' && <MonthView anchorDate={anchorDate} shifts={shifts} onShiftClick={onShiftClick} />}
    </div>
  )
}

function DayView({ day, shifts, onShiftClick }: { day: Date; shifts: Shift[]; onShiftClick: (shift: Shift) => void }) {
  const dayShifts = shiftsOnDay(shifts, day)

  return (
    <div className="rounded-card border border-surface-border bg-surface">
      {dayShifts.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No shifts scheduled" description="Nothing scheduled for this day." />
      ) : (
        <ul className="divide-y divide-surface-border">
          {dayShifts.map((shift) => (
            <li key={shift.id}>
              <button
                type="button"
                onClick={() => onShiftClick(shift)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{shift.staff.fullName}</p>
                  <p className="text-xs text-ink-muted">
                    {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                    {shift.department ? ` · ${shift.department}` : ''}
                  </p>
                </div>
                <ShiftStatusBadge status={shift.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function WeekView({
  anchorDate,
  shifts,
  onShiftClick,
}: {
  anchorDate: Date
  shifts: Shift[]
  onShiftClick: (shift: Shift) => void
}) {
  const weekStart = startOfWeek(anchorDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day, index) => {
        const dayShifts = shiftsOnDay(shifts, day)
        return (
          <div
            key={day.toISOString()}
            className={cn(
              'flex min-h-[10rem] flex-col gap-2 rounded-card border border-surface-border bg-surface p-3',
              isSameDay(day, today) && 'ring-2 ring-brand-500/40',
            )}
          >
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">{WEEKDAY_LABELS[index]}</p>
              <p className="text-sm font-medium text-ink">{day.getDate()}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {dayShifts.length === 0 ? (
                <p className="text-xs text-ink-muted">No shifts</p>
              ) : (
                dayShifts.map((shift) => <ShiftChip key={shift.id} shift={shift} onClick={() => onShiftClick(shift)} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MonthView({
  anchorDate,
  shifts,
  onShiftClick,
}: {
  anchorDate: Date
  shifts: Shift[]
  onShiftClick: (shift: Shift) => void
}) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const gridStart = startOfWeek(monthStart)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const today = new Date()
  const MAX_VISIBLE = 3

  return (
    <div className="overflow-hidden rounded-card border border-surface-border bg-surface">
      <div className="grid grid-cols-7 border-b border-surface-border bg-surface-alt text-xs font-semibold uppercase text-ink-muted">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayShifts = shiftsOnDay(shifts, day)
          const isCurrentMonth = day.getMonth() === anchorDate.getMonth()
          const visible = dayShifts.slice(0, MAX_VISIBLE)
          const overflow = dayShifts.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-surface-border p-1.5 last:border-r-0',
                !isCurrentMonth && 'bg-surface-alt/40',
              )}
            >
              <span
                className={cn(
                  'self-start rounded-full px-1.5 text-xs font-medium',
                  isSameDay(day, today) ? 'bg-brand-600 text-white' : isCurrentMonth ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {visible.map((shift) => (
                  <ShiftChip key={shift.id} shift={shift} onClick={() => onShiftClick(shift)} dense />
                ))}
                {overflow > 0 && <p className="text-[11px] text-ink-muted">+{overflow} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
