import type { LabTest } from '@/types/labTest'

export const MOCK_LAB_TESTS: LabTest[] = [
  { id: 'L-4001', patientId: 'P-1001', patientName: 'Sarah Johnson', doctorName: 'Dr. Priya Nair', testName: 'Lipid Panel', category: 'Biochemistry', requestedDate: '2026-08-01', status: 'completed' },
  { id: 'L-4002', patientId: 'P-1002', patientName: 'Michael Chen', doctorName: 'Dr. Marcus Webb', testName: 'MRI Brain', category: 'Radiology', requestedDate: '2026-08-02', status: 'in-progress' },
  { id: 'L-4003', patientId: 'P-1003', patientName: 'Emily Davis', doctorName: 'Dr. Amara Okafor', testName: 'Complete Blood Count', category: 'Hematology', requestedDate: '2026-07-30', status: 'completed' },
  { id: 'L-4004', patientId: 'P-1004', patientName: 'James Wilson', doctorName: 'Dr. Lianne Foster', testName: 'X-Ray Knee', category: 'Radiology', requestedDate: '2026-08-03', status: 'pending' },
  { id: 'L-4005', patientId: 'P-1005', patientName: 'Olivia Martinez', doctorName: 'Dr. Elena Popescu', testName: 'Throat Culture', category: 'Microbiology', requestedDate: '2026-08-01', status: 'in-progress' },
  { id: 'L-4006', patientId: 'P-1008', patientName: 'Robert Thomas', doctorName: 'Dr. Idris Bello', testName: 'Cardiac Enzyme Panel', category: 'Biochemistry', requestedDate: '2026-07-29', status: 'completed' },
  { id: 'L-4007', patientId: 'P-1009', patientName: 'Ava Moore', doctorName: 'Dr. Grace Kim', testName: 'Chest X-Ray', category: 'Radiology', requestedDate: '2026-07-27', status: 'completed' },
  { id: 'L-4008', patientId: 'P-1011', patientName: 'Isabella White', doctorName: 'Dr. Naomi Carter', testName: 'MRI Spine', category: 'Radiology', requestedDate: '2026-08-04', status: 'pending' },
  { id: 'L-4009', patientId: 'P-1012', patientName: 'Benjamin Harris', doctorName: 'Dr. Samuel Reyes', testName: 'Troponin Test', category: 'Biochemistry', requestedDate: '2026-08-01', status: 'in-progress' },
  { id: 'L-4010', patientId: 'P-1013', patientName: 'Mia Clark', doctorName: 'Dr. Felix Grant', testName: 'Bone Density Scan', category: 'Radiology', requestedDate: '2026-07-25', status: 'completed' },
  { id: 'L-4011', patientId: 'P-1006', patientName: 'Daniel Anderson', doctorName: 'Dr. Elena Popescu', testName: 'Skin Biopsy', category: 'Pathology', requestedDate: '2026-08-05', status: 'pending' },
  { id: 'L-4012', patientId: 'P-1007', patientName: 'Sophia Taylor', doctorName: 'Dr. Hiro Tanaka', testName: 'Allergy Panel', category: 'Biochemistry', requestedDate: '2026-08-02', status: 'in-progress' },
]
