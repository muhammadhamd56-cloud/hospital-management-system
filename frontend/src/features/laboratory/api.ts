import { api } from '@/lib/apiClient'
import type { LabTest, LabTestCategory, LabTestStatus } from '@/types/labTest'

export interface LabTestListResponse {
  tests: LabTest[]
}

export interface RequestLabTestInput {
  patientId: string
  doctorId: string
  testName: string
  category: LabTestCategory
}

export function listLabTests(): Promise<LabTestListResponse> {
  return api.get('/laboratory/tests')
}

export function requestLabTest(input: RequestLabTestInput): Promise<{ test: LabTest }> {
  return api.post('/laboratory/tests', input)
}

export function updateLabTestStatus(
  id: string,
  status: LabTestStatus,
  resultSummary?: string,
): Promise<{ test: LabTest }> {
  return api.patch(`/laboratory/tests/${id}/status`, { status, resultSummary })
}
