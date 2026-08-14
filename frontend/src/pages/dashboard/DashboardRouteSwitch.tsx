import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { PatientDashboardPage } from '@/pages/dashboard/PatientDashboardPage'
import { DoctorDashboardPage } from '@/pages/dashboard/DoctorDashboardPage'
import { ROUTES } from '@/constants/routes'

/**
 * Receptionist/lab_staff/pharmacist have no bespoke dashboard of their own --
 * DashboardPage's widgets (beds, revenue) call admin-only endpoints they
 * can't reach, so they'd just see failed-to-load toasts. Send them straight
 * to the one module they actually have access to instead.
 */
export function DashboardRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientDashboardPage />
  if (user?.role === 'doctor') return <DoctorDashboardPage />
  if (user?.role === 'receptionist') return <Navigate to={ROUTES.patients} replace />
  if (user?.role === 'lab_staff') return <Navigate to={ROUTES.laboratory} replace />
  if (user?.role === 'pharmacist') return <Navigate to={ROUTES.pharmacy} replace />

  return <DashboardPage />
}
