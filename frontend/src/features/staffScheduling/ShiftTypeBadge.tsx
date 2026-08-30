import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { SHIFT_TYPE_LABELS, type ShiftType } from '@/types/staffScheduling'

const VARIANTS: Record<ShiftType, NonNullable<BadgeProps['variant']>> = {
  morning: 'brand',
  evening: 'warning',
  night: 'neutral',
  custom: 'info',
}

export function ShiftTypeBadge({ shiftType }: { shiftType: ShiftType }) {
  return <Badge variant={VARIANTS[shiftType]}>{SHIFT_TYPE_LABELS[shiftType]}</Badge>
}
