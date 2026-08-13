import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { PatientMedicalRecordsPage } from '@/pages/medicalRecords/PatientMedicalRecordsPage'
import { DoctorMedicalRecordsPage } from '@/pages/medicalRecords/DoctorMedicalRecordsPage'
import { ROUTES } from '@/constants/routes'

export function MedicalRecordsRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'doctor') return <DoctorMedicalRecordsPage />
  if (user?.role === 'patient') return <PatientMedicalRecordsPage />

  return <Navigate to={ROUTES.dashboard} replace />
}
