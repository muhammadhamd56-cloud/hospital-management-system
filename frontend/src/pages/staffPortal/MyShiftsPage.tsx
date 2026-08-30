import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { CalendarView, type CalendarMode } from '@/features/staffScheduling/CalendarView'
import { ShiftDetailCard } from '@/features/staffPortal/ShiftDetailCard'
import { ShiftStatusBadge } from '@/features/staffScheduling/ShiftStatusBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { listMyShifts } from '@/features/staffPortal/api'
import type { Shift } from '@/types/staffScheduling'

type ShiftGroup = 'all' | 'upcoming' | 'active' | 'completed' | 'cancelled' | 'missed'

const GROUP_LABELS: Record<ShiftGroup, string> = {
  all: 'All',
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed',
}

function shiftGroup(shift: Shift): Exclude<ShiftGroup, 'all'> {
  if (shift.status === 'in_progress') return 'active'
  if (shift.status === 'completed') return 'completed'
  if (shift.status === 'cancelled') return 'cancelled'
  if (shift.status === 'absent') return 'missed'
  return 'upcoming'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function MyShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [groupFilter, setGroupFilter] = useState<ShiftGroup>('all')
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [viewingShift, setViewingShift] = useState<Shift | null>(null)

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    listMyShifts()
      .then((res) => setShifts(res.shifts))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const filteredShifts = useMemo(() => {
    const sorted = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime))
    if (groupFilter === 'all') return sorted
    return sorted.filter((shift) => shiftGroup(shift) === groupFilter)
  }, [shifts, groupFilter])

  const counts = useMemo(() => {
    const base: Record<ShiftGroup, number> = {
      all: shifts.length,
      upcoming: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      missed: 0,
    }
    shifts.forEach((shift) => {
      base[shiftGroup(shift)] += 1
    })
    return base
  }, [shifts])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Shifts</h1>
        <p className="text-sm text-ink-muted">
          {shifts.length} shift{shifts.length === 1 ? '' : 's'} on your schedule
        </p>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load your shifts." description="Something went wrong. Please try again." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : (
        <Tabs defaultTab="list">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(GROUP_LABELS) as ShiftGroup[]).map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setGroupFilter(group)}
                    className={
                      groupFilter === group
                        ? 'rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                        : 'rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink'
                    }
                  >
                    {GROUP_LABELS[group]} ({counts[group]})
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
              ) : filteredShifts.length === 0 ? (
                <div className="rounded-card border border-surface-border bg-surface">
                  <EmptyState icon={CalendarClock} title="No shifts here." description="Nothing matches this filter yet." />
                </div>
              ) : (
                <div className="rounded-card border border-surface-border bg-surface">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredShifts.map((shift) => (
                        <TableRow key={shift.id}>
                          <TableCell>{shift.department ?? '—'}</TableCell>
                          <TableCell>
                            <ShiftTypeBadge shiftType={shift.shiftType} />
                          </TableCell>
                          <TableCell>{formatDateTime(shift.startTime)}</TableCell>
                          <TableCell>{formatDateTime(shift.endTime)}</TableCell>
                          <TableCell>
                            <ShiftStatusBadge status={shift.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="secondary" onClick={() => setViewingShift(shift)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="calendar">
            {isLoading ? (
              <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
            ) : (
              <CalendarView
                mode={calendarMode}
                onModeChange={setCalendarMode}
                anchorDate={anchorDate}
                onAnchorChange={setAnchorDate}
                shifts={shifts}
                onShiftClick={setViewingShift}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <ShiftDetailCard shift={viewingShift} onClose={() => setViewingShift(null)} />
    </div>
  )
}
