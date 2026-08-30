import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { TASK_DISPLAY_STATUS_LABELS, type TaskDisplayStatus } from '@/types/staffPortal'

const VARIANTS: Record<TaskDisplayStatus, NonNullable<BadgeProps['variant']>> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  overdue: 'danger',
}

export function TaskStatusBadge({ status }: { status: TaskDisplayStatus }) {
  return <Badge variant={VARIANTS[status]}>{TASK_DISPLAY_STATUS_LABELS[status]}</Badge>
}
