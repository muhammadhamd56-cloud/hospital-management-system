import { useAuth } from '@/features/auth/useAuth'
import { PatientProfilePage } from '@/pages/profile/PatientProfilePage'
import { DoctorProfilePage } from '@/pages/profile/DoctorProfilePage'
import { GenericProfilePage } from '@/pages/profile/GenericProfilePage'

export function ProfileRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientProfilePage />
  if (user?.role === 'doctor') return <DoctorProfilePage />

  return <GenericProfilePage />
}
