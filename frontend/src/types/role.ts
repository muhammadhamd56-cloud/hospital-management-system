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

export type AuthRole = Extract<Role, 'admin' | 'doctor' | 'patient'>

// Self-signup / self-service role picker only offers doctor/patient — admin
// accounts are provisioned out-of-band, never self-assigned. 'admin' remains
// a valid AuthRole so existing admin accounts still type/display correctly.
export const AUTH_ROLES: AuthRole[] = ['doctor', 'patient']
