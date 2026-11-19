import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { BillingPage } from '@/pages/billing/BillingPage'
import { PatientBillingPage } from '@/pages/billing/PatientBillingPage'
import { AccessDenied } from '@/routes/AccessDenied'
import { ROUTES } from '@/constants/routes'

export function BillingRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientBillingPage />
  if (user?.role === 'admin' || user?.role === 'doctor') return <BillingPage />

  // Signed out is handled by ProtectedRoute; a signed-in role with no page here gets told so.
  if (!user) return <Navigate to={ROUTES.dashboard} replace />
  return <AccessDenied />
}
