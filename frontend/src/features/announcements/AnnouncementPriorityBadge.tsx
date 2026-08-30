import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { ANNOUNCEMENT_PRIORITY_LABELS, type AnnouncementPriority } from '@/types/staffPortal'

const VARIANTS: Record<AnnouncementPriority, NonNullable<BadgeProps['variant']>> = {
  normal: 'neutral',
  important: 'warning',
  urgent: 'danger',
}

export function AnnouncementPriorityBadge({ priority }: { priority: AnnouncementPriority }) {
  return <Badge variant={VARIANTS[priority]}>{ANNOUNCEMENT_PRIORITY_LABELS[priority]}</Badge>
}
