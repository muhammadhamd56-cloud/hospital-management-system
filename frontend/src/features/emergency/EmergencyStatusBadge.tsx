import { AlertTriangle, CheckCircle2, Clock, Siren, UserCheck, Users, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EMERGENCY_STATUS_LABELS, type EmergencyStatus } from '@/types/emergency'

// Icon + text alongside color, never color alone (section 28) -- CRITICAL vs
// a routine status must still be distinguishable without relying on hue.
const STATUS_CONFIG: Record<
  EmergencyStatus,
  { variant: 'neutral' | 'brand' | 'warning' | 'success' | 'danger' | 'info'; icon: typeof AlertTriangle }
> = {
  new: { variant: 'danger', icon: Siren },
  acknowledged: { variant: 'warning', icon: UserCheck },
  team_assigned: { variant: 'info', icon: Users },
  responding: { variant: 'info', icon: Clock },
  arrived: { variant: 'brand', icon: AlertTriangle },
  resolved: { variant: 'success', icon: CheckCircle2 },
  cancelled: { variant: 'neutral', icon: XCircle },
}

export function EmergencyStatusBadge({ status }: { status: EmergencyStatus }) {
  const { variant, icon: Icon } = STATUS_CONFIG[status]
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {EMERGENCY_STATUS_LABELS[status]}
    </Badge>
  )
}
