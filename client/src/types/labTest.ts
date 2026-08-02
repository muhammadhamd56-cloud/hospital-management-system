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
  doctorName: string
  testName: string
  category: LabTestCategory
  requestedDate: string
  status: LabTestStatus
}
