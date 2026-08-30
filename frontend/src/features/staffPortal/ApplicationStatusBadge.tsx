import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/types/staffPortal'

const VARIANTS: Record<ApplicationStatus, NonNullable<BadgeProps['variant']>> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge variant={VARIANTS[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>
}
