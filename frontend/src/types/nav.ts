import type { LucideIcon } from 'lucide-react'
import type { AuthUser } from '@/features/auth/AuthContext'
import type { Role } from '@/types/role'

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Route path; omitted for sections not yet implemented. */
  path?: string
  /** Roles that can see this item; omitted means visible to everyone. */
  roles?: Role[]
  /** Extra gating beyond `roles` -- e.g. only the subset of STAFF whose
   *  linked staffType is lab_technician. Evaluated together with `roles`
   *  (both must pass) when present. */
  visible?: (user: AuthUser) => boolean
}
