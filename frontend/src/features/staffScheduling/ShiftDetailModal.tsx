import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AttendanceStatusBadge } from '@/features/staffScheduling/AttendanceStatusBadge'
import { ShiftStatusBadge } from '@/features/staffScheduling/ShiftStatusBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { StaffTypeBadge } from '@/features/staffScheduling/StaffTypeBadge'
import type { Attendance, Shift } from '@/types/staffScheduling'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface ShiftDetailModalProps {
  shift: Shift | null
  attendance?: Attendance | null
  onClose: () => void
  onEdit: (shift: Shift) => void
  onCancel: (shift: Shift) => void
  onDelete: (shift: Shift) => void
  onRecordAttendance?: (shift: Shift) => void
}

export function ShiftDetailModal({
  shift,
  attendance,
  onClose,
  onEdit,
  onCancel,
  onDelete,
  onRecordAttendance,
}: ShiftDetailModalProps) {
  if (!shift) return null

  const canCancel = shift.status !== 'cancelled' && shift.status !== 'completed'
  const canDelete = shift.status === 'scheduled'

  return (
    <Modal
      isOpen={shift !== null}
      onClose={onClose}
      title={shift.staff.fullName}
      description={shift.department ?? 'No department assigned'}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <StaffTypeBadge staffType={shift.staff.staffType} />
          <ShiftTypeBadge shiftType={shift.shiftType} />
          <ShiftStatusBadge status={shift.status} />
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Start</dt>
            <dd className="text-ink">{formatDateTime(shift.startTime)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">End</dt>
            <dd className="text-ink">{formatDateTime(shift.endTime)}</dd>
          </div>
        </dl>
        {shift.notes && (
          <div>
            <p className="text-xs font-medium uppercase text-ink-muted">Notes</p>
            <p className="mt-1 text-sm text-ink">{shift.notes}</p>
          </div>
        )}
        {onRecordAttendance && (
          <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-alt px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase text-ink-muted">Attendance</span>
              {attendance ? <AttendanceStatusBadge status={attendance.status} /> : <span className="text-sm text-ink-muted">Not recorded</span>}
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => onRecordAttendance(shift)}>
              {attendance ? 'Update' : 'Record'}
            </Button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-3">
          {canDelete && (
            <Button type="button" variant="secondary" onClick={() => onDelete(shift)}>
              Delete
            </Button>
          )}
          {canCancel && (
            <Button type="button" variant="secondary" onClick={() => onCancel(shift)}>
              Cancel shift
            </Button>
          )}
          <Button type="button" onClick={() => onEdit(shift)}>
            Edit
          </Button>
        </div>
      </div>
    </Modal>
  )
}
