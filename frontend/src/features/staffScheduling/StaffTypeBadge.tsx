import { Badge } from '@/components/ui/Badge'
import { STAFF_TYPE_LABELS, type StaffType } from '@/types/staffScheduling'

export function StaffTypeBadge({ staffType }: { staffType: StaffType }) {
  return <Badge>{STAFF_TYPE_LABELS[staffType]}</Badge>
}
