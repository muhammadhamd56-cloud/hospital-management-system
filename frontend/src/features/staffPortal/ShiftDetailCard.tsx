import { Modal } from '@/components/ui/Modal'
import { ShiftStatusBadge } from '@/features/staffScheduling/ShiftStatusBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import type { Shift } from '@/types/staffScheduling'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ShiftDetailCard({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  if (!shift) return null

  return (
    <Modal isOpen={shift !== null} onClose={onClose} title="Shift details">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShiftTypeBadge shiftType={shift.shiftType} />
          <ShiftStatusBadge status={shift.status} />
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">Department</dt>
            <dd className="font-medium text-ink">{shift.department ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Starts</dt>
            <dd className="font-medium text-ink">{formatDateTime(shift.startTime)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Ends</dt>
            <dd className="font-medium text-ink">{formatDateTime(shift.endTime)}</dd>
          </div>
          {shift.notes && (
            <div>
              <dt className="text-ink-muted">Notes</dt>
              <dd className="font-medium text-ink">{shift.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </Modal>
  )
}
