export type Role =
  | 'admin'
  | 'doctor'
  | 'receptionist'
  | 'patient'
  | 'lab-staff'
  | 'pharmacist'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  patient: 'Patient',
  'lab-staff': 'Laboratory Staff',
  pharmacist: 'Pharmacist',
}
