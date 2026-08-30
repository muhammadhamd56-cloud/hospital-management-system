import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { SHIFT_STATUS_LABELS, type ShiftStatus } from '@/types/staffScheduling'

const VARIANTS: Record<ShiftStatus, NonNullable<BadgeProps['variant']>> = {
  scheduled: 'info',
  confirmed: 'brand',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  absent: 'danger',
}

export function ShiftStatusBadge({ status }: { status: ShiftStatus }) {
  return <Badge variant={VARIANTS[status]}>{SHIFT_STATUS_LABELS[status]}</Badge>
}
