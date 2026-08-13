import { useAuth } from '@/features/auth/useAuth'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { PatientDashboardPage } from '@/pages/dashboard/PatientDashboardPage'
import { DoctorDashboardPage } from '@/pages/dashboard/DoctorDashboardPage'

export function DashboardRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientDashboardPage />
  if (user?.role === 'doctor') return <DoctorDashboardPage />

  return <DashboardPage />
}
