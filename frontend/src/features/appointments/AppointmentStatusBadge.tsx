import { Badge } from '@/components/ui/Badge'
import type { AppointmentStatus } from '@/types/appointment'

const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; variant: 'brand' | 'success' | 'danger' | 'neutral' }
> = {
  scheduled: { label: 'Scheduled', variant: 'brand' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  'no-show': { label: 'No-show', variant: 'neutral' },
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, variant } = STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}
