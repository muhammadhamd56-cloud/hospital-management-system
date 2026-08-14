/** Roles an admin can provision directly. Never 'admin' (out-of-band) or 'patient' (self-registers). */
export type StaffRole = 'doctor' | 'receptionist' | 'lab_staff' | 'pharmacist'

export const STAFF_ROLE_OPTIONS: { label: string; value: StaffRole }[] = [
  { label: 'Doctor', value: 'doctor' },
  { label: 'Receptionist', value: 'receptionist' },
  { label: 'Laboratory Staff', value: 'lab_staff' },
  { label: 'Pharmacist', value: 'pharmacist' },
]

export interface Staff {
  id: string
  fullName: string
  email: string
  role: StaffRole
  createdAt: string
}
