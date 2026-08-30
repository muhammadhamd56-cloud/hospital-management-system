import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { ROUTES } from '@/constants/routes'
import type { Role } from '@/types/role'

export function RoleRoute({ allow }: { allow: Role[] }) {
  const { user } = useAuth()

  if (!user || !allow.includes(user.role)) {
    return <Navigate to={ROUTES.dashboard} replace />
  }

  return <Outlet />
}

/** Admin/doctor always pass. Role.STAFF is shared by every non-doctor staff
 *  type, so a STAFF caller only passes when their linked roster row is
 *  specifically a lab technician -- mirrors the backend's
 *  LaboratoryService.requireLabAccess check. */
export function LaboratoryRoute() {
  const { user } = useAuth()

  const allowed =
    user?.role === 'admin' ||
    user?.role === 'doctor' ||
    (user?.role === 'staff' && user.staffType === 'lab_technician')

  if (!allowed) {
    return <Navigate to={ROUTES.dashboard} replace />
  }

  return <Outlet />
}
