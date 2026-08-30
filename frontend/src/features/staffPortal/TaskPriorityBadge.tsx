import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@/types/staffPortal'

const VARIANTS: Record<TaskPriority, NonNullable<BadgeProps['variant']>> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge variant={VARIANTS[priority]}>{TASK_PRIORITY_LABELS[priority]}</Badge>
}
