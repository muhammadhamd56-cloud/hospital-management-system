import { api } from '@/lib/apiClient'
import type { Staff, StaffRole } from '@/types/staff'

export interface StaffListResponse {
  staff: Staff[]
}

export interface CreateStaffInput {
  firstName: string
  lastName: string
  email: string
  role: StaffRole
  specialization?: string
  department?: string
  bio?: string
  experienceYears?: number
}

export interface CreateStaffResponse {
  staff: Staff
  /** Plaintext temp password, returned exactly once — show it to the admin, don't persist it. */
  tempPassword: string
}

export function listStaff(): Promise<StaffListResponse> {
  return api.get('/staff')
}

export function createStaff(input: CreateStaffInput): Promise<CreateStaffResponse> {
  return api.post('/staff', input)
}
