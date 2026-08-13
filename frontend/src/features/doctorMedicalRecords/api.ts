import { api } from '@/lib/apiClient'
import type { MedicalRecord } from '@/types/medicalRecord'

export function listPatientMedicalRecords(patientId: string): Promise<{ records: MedicalRecord[] }> {
  return api.get(`/doctor-portal/patients/${patientId}/medical-records`)
}

export interface PrescriptionInput {
  medicationName: string
  dosage: string
  frequency: string
  durationDays: number
  instructions?: string
}

export interface CreateMedicalRecordInput {
  diagnosis: string
  notes: string
  prescriptions?: PrescriptionInput[]
}

export function createMedicalRecord(
  patientId: string,
  input: CreateMedicalRecordInput,
): Promise<{ record: MedicalRecord }> {
  return api.post(`/doctor-portal/patients/${patientId}/medical-records`, input)
}
