export type Role =
  | 'admin'
  | 'doctor'
  | 'receptionist'
  | 'patient'
  | 'lab_staff'
  | 'pharmacist'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  patient: 'Patient',
  lab_staff: 'Laboratory Staff',
  pharmacist: 'Pharmacist',
}

export type AuthRole = Extract<Role, 'admin' | 'doctor' | 'patient'>

// Self-signup / self-service role picker only offers doctor/patient — admin
// accounts are provisioned out-of-band, never self-assigned. 'admin' remains
// a valid AuthRole so existing admin accounts still type/display correctly.
export const AUTH_ROLES: AuthRole[] = ['doctor', 'patient']

// The *login* role picker is broader than AUTH_ROLES: any account that
// already exists (self-signed-up, Google, or admin-provisioned) needs to be
// able to pick its role at login, including staff roles that were never
// self-signup options.
export const LOGIN_ROLES: Role[] = ['admin', 'doctor', 'patient', 'receptionist', 'lab_staff', 'pharmacist']
