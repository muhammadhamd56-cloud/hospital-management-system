import { AlertOctagon, ArrowUp, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EMERGENCY_PRIORITY_LABELS, type EmergencyPriority } from '@/types/emergency'

const PRIORITY_CONFIG: Record<EmergencyPriority, { variant: 'danger' | 'warning' | 'neutral'; icon: typeof AlertOctagon }> = {
  critical: { variant: 'danger', icon: AlertOctagon },
  high: { variant: 'warning', icon: ArrowUp },
  normal: { variant: 'neutral', icon: Minus },
}

export function EmergencyPriorityBadge({ priority }: { priority: EmergencyPriority }) {
  const { variant, icon: Icon } = PRIORITY_CONFIG[priority]
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {EMERGENCY_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
