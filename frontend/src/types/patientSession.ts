export type SessionMode = 'online' | 'in-person'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled'

export interface PatientAppointment {
  id: string
  doctorId: string
  doctorName: string
  specialization: string
  department: string
  scheduledAt: string
  mode: SessionMode
  status: SessionStatus
  reason: string
  /** Snapshot of the doctor's consultation fee at booking time -- never the doctor's current fee. */
  consultationFee: number
}
