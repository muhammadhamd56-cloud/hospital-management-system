import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Route path; omitted for sections not yet implemented. */
  path?: string
}
