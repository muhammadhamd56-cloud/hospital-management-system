import { Badge } from '@/components/ui/Badge'
import type { BedStatus } from '@/types/bed'

const STATUS_CONFIG: Record<BedStatus, { label: string; variant: 'success' | 'brand' | 'warning' }> = {
  available: { label: 'Available', variant: 'success' },
  occupied: { label: 'Occupied', variant: 'brand' },
  maintenance: { label: 'Maintenance', variant: 'warning' },
}

export function BedStatusBadge({ status }: { status: BedStatus }) {
  const { label, variant } = STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}
