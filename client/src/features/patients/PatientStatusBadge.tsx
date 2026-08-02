import { Badge } from '@/components/ui/Badge'
import type { PatientStatus } from '@/types/patient'

const STATUS_CONFIG: Record<PatientStatus, { label: string; variant: 'success' | 'info' | 'neutral' }> = {
  active: { label: 'Active', variant: 'success' },
  admitted: { label: 'Admitted', variant: 'info' },
  discharged: { label: 'Discharged', variant: 'neutral' },
}

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  const { label, variant } = STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}
