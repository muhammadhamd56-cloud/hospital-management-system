export interface DirectoryDoctor {
  id: string
  fullName: string
  specialization: string
  qualifications: string | null
  department: string
  bio: string
  experienceYears: number
  rating: number
  acceptsOnline: boolean
  isAvailable: boolean
  consultationFee: number
  appointmentDurationMinutes: number
  email: string | null
}
