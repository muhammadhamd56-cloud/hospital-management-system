import type { LucideIcon } from 'lucide-react'
import type { Role } from '@/types/role'

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Route path; omitted for sections not yet implemented. */
  path?: string
  /** Roles that can see this item; omitted means visible to everyone. */
  roles?: Role[]
}
