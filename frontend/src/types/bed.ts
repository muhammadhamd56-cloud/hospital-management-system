export type BedStatus = 'available' | 'occupied' | 'maintenance'

export interface Bed {
  id: string
  label: string
  department: string
  status: BedStatus
  patientId: string | null
  patientName: string | null
}
