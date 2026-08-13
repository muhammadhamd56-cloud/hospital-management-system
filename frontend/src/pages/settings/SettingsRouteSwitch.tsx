import { useAuth } from '@/features/auth/useAuth'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { PatientSettingsPage } from '@/pages/settings/PatientSettingsPage'
import { DoctorSettingsPage } from '@/pages/settings/DoctorSettingsPage'

export function SettingsRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'patient') return <PatientSettingsPage />
  if (user?.role === 'doctor') return <DoctorSettingsPage />

  return <SettingsPage />
}
