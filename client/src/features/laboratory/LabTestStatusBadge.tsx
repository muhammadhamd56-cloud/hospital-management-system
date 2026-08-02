import { Badge } from '@/components/ui/Badge'
import type { LabTestStatus } from '@/types/labTest'

const STATUS_CONFIG: Record<LabTestStatus, { label: string; variant: 'warning' | 'brand' | 'success' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  'in-progress': { label: 'In Progress', variant: 'brand' },
  completed: { label: 'Completed', variant: 'success' },
}

export function LabTestStatusBadge({ status }: { status: LabTestStatus }) {
  const { label, variant } = STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}
