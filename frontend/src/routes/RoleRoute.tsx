import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { canAccessEmergency } from '@/features/emergency/access'
import { AccessDenied } from '@/routes/AccessDenied'
import { ROUTES } from '@/constants/routes'
import type { Role } from '@/types/role'

/** No user at all isn't an authorization failure (ProtectedRoute normally
 *  handles it first), so that case still goes home. A signed-in user whose
 *  role isn't allowed sees AccessDenied in place of the page. */
export function RoleRoute({ allow }: { allow: Role[] }) {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to={ROUTES.dashboard} replace />
  }

  if (!allow.includes(user.role)) {
    return <AccessDenied />
  }

  return <Outlet />
}

/** Admin/doctor always pass. Role.STAFF is shared by every non-doctor staff
 *  type, so a STAFF caller only passes when their linked roster row is
 *  specifically a lab technician -- mirrors the backend's
 *  LaboratoryService.requireLabAccess check. */
export function LaboratoryRoute() {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to={ROUTES.dashboard} replace />
  }

  const allowed =
    user.role === 'admin' ||
    user.role === 'doctor' ||
    (user.role === 'staff' && user.staffType === 'lab_technician')

  if (!allowed) {
    return <AccessDenied />
  }

  return <Outlet />
}

/** Same gate as EmergencyRouteSwitch, for the routes under /emergency that
 *  aren't role-switched (e.g. /emergency/cases/:id). */
export function EmergencyRoute() {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to={ROUTES.dashboard} replace />
  }

  if (!canAccessEmergency(user)) {
    return <AccessDenied />
  }

  return <Outlet />
}
