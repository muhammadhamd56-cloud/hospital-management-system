import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { ROUTES } from '@/constants/routes'
import type { AuthRole } from '@/types/role'

export function RoleRoute({ allow }: { allow: AuthRole[] }) {
  const { user } = useAuth()

  if (!user || !allow.includes(user.role)) {
    return <Navigate to={ROUTES.dashboard} replace />
  }

  return <Outlet />
}
