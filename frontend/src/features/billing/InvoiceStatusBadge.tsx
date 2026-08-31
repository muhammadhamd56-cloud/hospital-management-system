import { Badge } from '@/components/ui/Badge'
import type { InvoiceStatus } from '@/types/invoice'

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' }> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  partially_paid: { label: 'Partially Paid', variant: 'brand' },
  overdue: { label: 'Overdue', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, variant } = STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}
