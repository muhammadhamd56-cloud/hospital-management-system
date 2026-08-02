import { Badge } from '@/components/ui/Badge'
import { getStockStatus, type StockStatus } from '@/types/medicine'

const STATUS_CONFIG: Record<StockStatus, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  'in-stock': { label: 'In Stock', variant: 'success' },
  'low-stock': { label: 'Low Stock', variant: 'warning' },
  'out-of-stock': { label: 'Out of Stock', variant: 'danger' },
}

export function StockStatusBadge({ stock }: { stock: number }) {
  const { label, variant } = STATUS_CONFIG[getStockStatus(stock)]
  return <Badge variant={variant}>{label}</Badge>
}
