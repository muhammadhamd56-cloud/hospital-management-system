import { api } from '@/lib/apiClient'
import type { PatientDetail, PatientListItem } from '@/types/patientDirectory'

export function listPatients(): Promise<{ patients: PatientListItem[] }> {
  return api.get('/patients')
}

export function getPatient(id: string): Promise<{ patient: PatientDetail }> {
  return api.get(`/patients/${id}`)
}
