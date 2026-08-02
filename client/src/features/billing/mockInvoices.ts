import type { Invoice } from '@/types/invoice'

export const MOCK_INVOICES: Invoice[] = [
  { id: 'INV-6001', patientId: 'P-1001', patientName: 'Sarah Johnson', description: 'Cardiac checkup + Lipid Panel', amount: 245.0, issueDate: '2026-07-28', dueDate: '2026-08-11', status: 'paid' },
  { id: 'INV-6002', patientId: 'P-1002', patientName: 'Michael Chen', description: 'Neurology consultation + MRI Brain', amount: 1280.5, issueDate: '2026-07-30', dueDate: '2026-08-13', status: 'pending' },
  { id: 'INV-6003', patientId: 'P-1003', patientName: 'Emily Davis', description: 'Pediatric visit + Vaccination', amount: 95.0, issueDate: '2026-06-14', dueDate: '2026-06-28', status: 'overdue' },
  { id: 'INV-6004', patientId: 'P-1004', patientName: 'James Wilson', description: 'Orthopedic consultation + X-Ray', amount: 410.75, issueDate: '2026-07-31', dueDate: '2026-08-14', status: 'pending' },
  { id: 'INV-6005', patientId: 'P-1005', patientName: 'Olivia Martinez', description: 'General consultation', amount: 120.0, issueDate: '2026-07-20', dueDate: '2026-08-03', status: 'paid' },
  { id: 'INV-6006', patientId: 'P-1008', patientName: 'Robert Thomas', description: 'ICU admission (2 nights)', amount: 3450.0, issueDate: '2026-08-01', dueDate: '2026-08-15', status: 'pending' },
  { id: 'INV-6007', patientId: 'P-1006', patientName: 'Daniel Anderson', description: 'Dermatology consultation + Skin Biopsy', amount: 275.25, issueDate: '2026-05-02', dueDate: '2026-05-16', status: 'overdue' },
  { id: 'INV-6008', patientId: 'P-1009', patientName: 'Ava Moore', description: 'Radiology review + Chest X-Ray', amount: 180.0, issueDate: '2026-07-11', dueDate: '2026-07-25', status: 'paid' },
  { id: 'INV-6009', patientId: 'P-1012', patientName: 'Benjamin Harris', description: 'Emergency room visit', amount: 890.0, issueDate: '2026-08-01', dueDate: '2026-08-15', status: 'pending' },
  { id: 'INV-6010', patientId: 'P-1013', patientName: 'Mia Clark', description: 'Orthopedic follow-up', amount: 150.0, issueDate: '2026-06-30', dueDate: '2026-07-14', status: 'paid' },
  { id: 'INV-6011', patientId: 'P-1014', patientName: 'Ethan Lewis', description: 'Dermatology consultation + Biopsy', amount: 320.0, issueDate: '2026-07-22', dueDate: '2026-08-05', status: 'paid' },
  { id: 'INV-6012', patientId: 'P-1007', patientName: 'Sophia Taylor', description: 'Allergy Panel + consultation', amount: 210.0, issueDate: '2026-07-29', dueDate: '2026-08-12', status: 'pending' },
]
