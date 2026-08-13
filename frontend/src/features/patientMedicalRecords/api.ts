import { api } from '@/lib/apiClient'
import type { MedicalRecord } from '@/types/medicalRecord'

export function listMyMedicalRecords(): Promise<{ records: MedicalRecord[] }> {
  return api.get('/medical-records/me')
}
