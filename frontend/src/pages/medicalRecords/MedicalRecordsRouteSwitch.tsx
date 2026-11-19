import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { PatientMedicalRecordsPage } from '@/pages/medicalRecords/PatientMedicalRecordsPage'
import { DoctorMedicalRecordsPage } from '@/pages/medicalRecords/DoctorMedicalRecordsPage'
import { AccessDenied } from '@/routes/AccessDenied'
import { ROUTES } from '@/constants/routes'

export function MedicalRecordsRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'doctor') return <DoctorMedicalRecordsPage />
  if (user?.role === 'patient') return <PatientMedicalRecordsPage />

  // Signed out is handled by ProtectedRoute; a signed-in role with no page here gets told so.
  if (!user) return <Navigate to={ROUTES.dashboard} replace />
  return <AccessDenied />
}
