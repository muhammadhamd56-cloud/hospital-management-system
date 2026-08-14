import { Navigate, Outlet, useLocation } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { ROUTES } from '@/constants/routes'

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-alt">
      <Loader2 className="size-6 animate-spin text-brand-600" aria-hidden="true" />
    </div>
  )
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullScreenSpinner />
  if (!user) return <Navigate to={ROUTES.login} replace />

  if (!user.roleSelected && location.pathname !== ROUTES.selectRole) {
    return <Navigate to={ROUTES.selectRole} replace />
  }

  if (user.mustChangePassword && location.pathname !== ROUTES.setPassword) {
    return <Navigate to={ROUTES.setPassword} replace />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <FullScreenSpinner />
  if (user) return <Navigate to={ROUTES.dashboard} replace />

  return <Outlet />
}
