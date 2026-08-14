export type LabTestStatus = 'pending' | 'in-progress' | 'completed'

export const LAB_TEST_CATEGORIES = [
  'Hematology',
  'Biochemistry',
  'Microbiology',
  'Radiology',
  'Pathology',
] as const

export type LabTestCategory = (typeof LAB_TEST_CATEGORIES)[number]

export interface LabTest {
  id: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  department: string
  assignedToId: string | null
  assignedToName: string | null
  testName: string
  category: LabTestCategory
  status: LabTestStatus
  resultSummary: string | null
  requestedAt: string
  completedAt: string | null
}
