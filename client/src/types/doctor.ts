export type DoctorStatus = 'available' | 'in-surgery' | 'on-leave'

export const DEPARTMENTS = [
  'Cardiology',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
  'Dermatology',
  'General Medicine',
  'Emergency',
  'Radiology',
] as const

export type Department = (typeof DEPARTMENTS)[number]

export interface Doctor {
  id: string
  name: string
  specialization: string
  department: Department
  email: string
  phone: string
  experienceYears: number
  status: DoctorStatus
}
