import { api } from '@/lib/apiClient'
import type { PatientDetail, PatientListItem } from '@/types/patientDirectory'

export interface CreatePatientInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

export interface CreatePatientResponse {
  patient: PatientListItem
  /** Plaintext temp password, returned exactly once — show it to the admin, don't persist it. */
  tempPassword: string
}

export function listPatients(): Promise<{ patients: PatientListItem[] }> {
  return api.get('/patients')
}

export function getPatient(id: string): Promise<{ patient: PatientDetail }> {
  return api.get(`/patients/${id}`)
}

export function createPatient(input: CreatePatientInput): Promise<CreatePatientResponse> {
  return api.post('/patients', input)
}
