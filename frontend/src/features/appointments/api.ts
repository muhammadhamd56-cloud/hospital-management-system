import { api } from '@/lib/apiClient'
import type { SessionMode, SessionStatus } from '@/types/patientSession'

export interface AdminAppointment {
  id: string
  patientName: string
  doctorName: string
  specialization: string
  department: string
  scheduledAt: string
  mode: SessionMode
  status: SessionStatus
  reason: string
}

/** Admin-wide view across all doctors/patients. */
export function listAllAppointments(): Promise<{ appointments: AdminAppointment[] }> {
  return api.get('/appointments')
}

export interface AdminBookAppointmentInput {
  patientId: string
  doctorId: string
  scheduledAt: string
  mode: SessionMode
  reason: string
}

/** Front-desk/admin booking on a patient's behalf. */
export function bookAppointmentForPatient(
  input: AdminBookAppointmentInput,
): Promise<{ appointment: AdminAppointment }> {
  return api.post('/appointments/admin', input)
}
