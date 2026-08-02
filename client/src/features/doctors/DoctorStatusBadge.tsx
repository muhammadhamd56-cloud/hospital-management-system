import { Badge } from '@/components/ui/Badge'
import type { DoctorStatus } from '@/types/doctor'

const STATUS_CONFIG: Record<DoctorStatus, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  available: { label: 'Available', variant: 'success' },
  'in-surgery': { label: 'In Surgery', variant: 'warning' },
  'on-leave': { label: 'On Leave', variant: 'neutral' },
}

export function DoctorStatusBadge({ status }: { status: DoctorStatus }) {
  const { label, variant } = STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}
