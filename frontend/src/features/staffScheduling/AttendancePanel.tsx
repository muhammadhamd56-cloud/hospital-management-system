import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { AttendanceStatusBadge } from '@/features/staffScheduling/AttendanceStatusBadge'
import type { Attendance, Shift } from '@/types/staffScheduling'

interface AttendancePanelProps {
  shifts: Shift[]
  attendance: Attendance[]
  isLoading: boolean
  onRecord: (shift: Shift) => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function AttendancePanel({ shifts, attendance, isLoading, onRecord }: AttendancePanelProps) {
  const attendanceByShiftId = new Map(attendance.map((record) => [record.shiftId, record]))
  const rows = shifts
    .filter((shift) => shift.status !== 'cancelled')
    .sort((a, b) => b.startTime.localeCompare(a.startTime))

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-surface-border bg-surface">
        <EmptyState icon={ClipboardCheck} title="No shifts to track attendance for" description="Schedule a shift first." />
      </div>
    )
  }

  return (
    <div className="rounded-card border border-surface-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Shift</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((shift) => {
            const record = attendanceByShiftId.get(shift.id)
            return (
              <TableRow key={shift.id}>
                <TableCell className="font-medium text-ink">{shift.staff.fullName}</TableCell>
                <TableCell>
                  {formatDateTime(shift.startTime)} – {formatDateTime(shift.endTime)}
                </TableCell>
                <TableCell>
                  {record ? <AttendanceStatusBadge status={record.status} /> : <span className="text-ink-muted">Not recorded</span>}
                </TableCell>
                <TableCell>{formatTime(record?.checkIn ?? null)}</TableCell>
                <TableCell>{formatTime(record?.checkOut ?? null)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => onRecord(shift)}>
                    {record ? 'Update' : 'Record'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
