export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show'

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  department: string
  date: string
  time: string
  reason: string
  status: AppointmentStatus
}
