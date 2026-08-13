import type { Appointment } from '@/types/appointment'

export const MOCK_APPOINTMENTS: Appointment[] = [
  { id: 'A-3001', patientId: 'P-1001', patientName: 'Sarah Johnson', doctorId: 'D-2001', doctorName: 'Dr. Priya Nair', department: 'Cardiology', date: '2026-08-03', time: '09:00', reason: 'Routine cardiac checkup', status: 'scheduled' },
  { id: 'A-3002', patientId: 'P-1002', patientName: 'Michael Chen', doctorId: 'D-2002', doctorName: 'Dr. Marcus Webb', department: 'Neurology', date: '2026-08-02', time: '11:30', reason: 'Post-surgery follow-up', status: 'scheduled' },
  { id: 'A-3003', patientId: 'P-1003', patientName: 'Emily Davis', doctorId: 'D-2004', doctorName: 'Dr. Amara Okafor', department: 'Pediatrics', date: '2026-07-30', time: '14:00', reason: 'Vaccination', status: 'completed' },
  { id: 'A-3004', patientId: 'P-1005', patientName: 'Olivia Martinez', doctorId: 'D-2006', doctorName: 'Dr. Elena Popescu', department: 'General Medicine', date: '2026-08-01', time: '10:15', reason: 'Fever and fatigue', status: 'completed' },
  { id: 'A-3005', patientId: 'P-1007', patientName: 'Sophia Taylor', doctorId: 'D-2005', doctorName: 'Dr. Hiro Tanaka', department: 'Dermatology', date: '2026-08-04', time: '13:00', reason: 'Skin rash evaluation', status: 'scheduled' },
  { id: 'A-3006', patientId: 'P-1008', patientName: 'Robert Thomas', doctorId: 'D-2009', doctorName: 'Dr. Idris Bello', department: 'Cardiology', date: '2026-07-29', time: '09:45', reason: 'Arrhythmia consultation', status: 'no-show' },
  { id: 'A-3007', patientId: 'P-1004', patientName: 'James Wilson', doctorId: 'D-2003', doctorName: 'Dr. Lianne Foster', department: 'Orthopedics', date: '2026-08-05', time: '15:30', reason: 'Knee pain assessment', status: 'scheduled' },
  { id: 'A-3008', patientId: 'P-1009', patientName: 'Ava Moore', doctorId: 'D-2008', doctorName: 'Dr. Grace Kim', department: 'Radiology', date: '2026-07-27', time: '08:30', reason: 'Chest X-ray review', status: 'completed' },
  { id: 'A-3009', patientId: 'P-1011', patientName: 'Isabella White', doctorId: 'D-2010', doctorName: 'Dr. Naomi Carter', department: 'Neurology', date: '2026-08-02', time: '16:00', reason: 'Migraine follow-up', status: 'cancelled' },
  { id: 'A-3010', patientId: 'P-1012', patientName: 'Benjamin Harris', doctorId: 'D-2007', doctorName: 'Dr. Samuel Reyes', department: 'Emergency', date: '2026-08-01', time: '19:20', reason: 'Chest pain evaluation', status: 'completed' },
  { id: 'A-3011', patientId: 'P-1014', patientName: 'Ethan Lewis', doctorId: 'D-2012', doctorName: 'Dr. Yuki Sato', department: 'Dermatology', date: '2026-08-06', time: '11:00', reason: 'Mole biopsy', status: 'scheduled' },
  { id: 'A-3012', patientId: 'P-1013', patientName: 'Mia Clark', doctorId: 'D-2011', doctorName: 'Dr. Felix Grant', department: 'Orthopedics', date: '2026-07-25', time: '10:45', reason: 'Sprained ankle', status: 'completed' },
]
