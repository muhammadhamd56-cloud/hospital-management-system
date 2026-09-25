import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { PatientEmergencyPage } from '@/pages/emergency/PatientEmergencyPage'
import { EmergencyCenterPage } from '@/pages/emergency/EmergencyCenterPage'
import { ROUTES } from '@/constants/routes'

export function EmergencyRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientEmergencyPage />
  if (user?.role === 'admin' || user?.role === 'doctor') return <EmergencyCenterPage />
  // Same gating as the sidebar's "Emergency" item -- a STAFF account that
  // isn't a nurse (e.g. receptionist) typing the URL directly gets sent
  // home instead of a page full of 403s from every request it fires.
  if (user?.role === 'staff' && user.staffType === 'nurse') return <EmergencyCenterPage />

  return <Navigate to={ROUTES.dashboard} replace />
}
