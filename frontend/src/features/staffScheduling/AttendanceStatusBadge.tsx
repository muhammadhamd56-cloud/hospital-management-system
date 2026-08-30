import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@/types/staffScheduling'

const VARIANTS: Record<AttendanceStatus, NonNullable<BadgeProps['variant']>> = {
  scheduled: 'info',
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave: 'neutral',
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge variant={VARIANTS[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Badge>
}
