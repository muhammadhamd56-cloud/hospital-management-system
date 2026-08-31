import type { PatientAppointment } from '@/types/patientSession'

export interface PatientListItem {
  id: string
  fullName: string
  email: string
  phone: string | null
  picture: string | null
  joinedAt: string
  appointmentCount: number
  lastVisit: string | null
}

export interface PatientDetail extends PatientListItem {
  appointments: PatientAppointment[]
}
