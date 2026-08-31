import type { SessionMode, SessionStatus } from '@/types/patientSession'

export interface DoctorAppointment {
  id: string
  patientId: string
  patientName: string
  scheduledAt: string
  mode: SessionMode
  status: SessionStatus
  reason: string
  consultationFee: number
}
