import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { BillingPage } from '@/pages/billing/BillingPage'
import { PatientBillingPage } from '@/pages/billing/PatientBillingPage'
import { ROUTES } from '@/constants/routes'

export function BillingRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientBillingPage />
  if (user?.role === 'admin' || user?.role === 'doctor') return <BillingPage />

  return <Navigate to={ROUTES.dashboard} replace />
}
