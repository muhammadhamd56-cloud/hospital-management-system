export interface Prescription {
  id: string
  medicationName: string
  dosage: string
  frequency: string
  durationDays: number
  instructions: string | null
}

export interface MedicalRecord {
  id: string
  patientId: string
  doctorId: string
  doctorName: string
  specialization: string
  appointmentId: string | null
  diagnosis: string
  notes: string
  createdAt: string
  prescriptions: Prescription[]
}
