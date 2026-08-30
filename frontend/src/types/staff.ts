/** Roles an admin can provision directly. Never 'admin' (out-of-band) or 'patient' (self-registers).
 *  'staff' covers every non-doctor staff member -- which specific one
 *  (nurse, receptionist, pharmacist, lab technician, other) is set later via
 *  their Staff.staffType on the scheduling roster, not here. */
export type StaffRole = 'doctor' | 'staff'

export const STAFF_ROLE_OPTIONS: { label: string; value: StaffRole }[] = [
  { label: 'Doctor', value: 'doctor' },
  { label: 'Staff', value: 'staff' },
]

export interface Staff {
  id: string
  fullName: string
  email: string
  role: StaffRole
  createdAt: string
}
