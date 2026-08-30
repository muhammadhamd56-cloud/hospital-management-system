export interface DirectoryDoctor {
  id: string
  fullName: string
  specialization: string
  department: string
  bio: string
  experienceYears: number
  rating: number
  acceptsOnline: boolean
  isAvailable: boolean
  consultationFee: number
  email: string | null
}
