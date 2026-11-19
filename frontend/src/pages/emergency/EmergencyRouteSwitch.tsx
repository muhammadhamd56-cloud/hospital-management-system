import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { canAccessEmergency } from '@/features/emergency/access'
import { PatientEmergencyPage } from '@/pages/emergency/PatientEmergencyPage'
import { EmergencyCenterPage } from '@/pages/emergency/EmergencyCenterPage'
import { AccessDenied } from '@/routes/AccessDenied'
import { ROUTES } from '@/constants/routes'

export function EmergencyRouteSwitch() {
  const { user } = useAuth()

  if (!user) return <Navigate to={ROUTES.dashboard} replace />

  // Same gating as the sidebar's "Emergency" item -- a STAFF account that
  // isn't a nurse (e.g. receptionist) typing the URL directly sees an
  // access-denied state instead of a page full of 403s from every request.
  if (!canAccessEmergency(user)) return <AccessDenied />

  if (user.role === 'patient') return <PatientEmergencyPage />
  return <EmergencyCenterPage />
}
