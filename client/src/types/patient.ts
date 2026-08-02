export type PatientStatus = 'active' | 'admitted' | 'discharged'
export type Gender = 'male' | 'female' | 'other'

export interface Patient {
  id: string
  name: string
  gender: Gender
  age: number
  phone: string
  email: string
  bloodGroup: string
  lastVisit: string
  status: PatientStatus
}
