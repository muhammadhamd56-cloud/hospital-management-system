export type Role =
  | 'admin'
  | 'doctor'
  | 'patient'
  | 'staff'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  patient: 'Patient',
  staff: 'Staff',
}

export type AuthRole = Extract<Role, 'admin' | 'doctor' | 'patient' | 'staff'>

// Self-signup / self-service role picker offers doctor/patient/staff —
// admin accounts are provisioned out-of-band, never self-assigned. 'admin'
// remains a valid AuthRole so existing admin accounts still type/display
// correctly. 'staff' is the umbrella login role for every non-doctor staff
// member -- nurse, receptionist, pharmacist, lab technician, other -- which
// specific one they are lives on their linked Staff.staffType, not here. A
// self-signed-up staff/doctor account still needs an admin to link it onto
// the scheduling roster afterward (Staff Scheduling -> Add staff).
export const AUTH_ROLES: AuthRole[] = ['doctor', 'patient', 'staff']

// The *login* role picker is broader than AUTH_ROLES: any account that
// already exists (self-signed-up, Google, or admin-provisioned) needs to be
// able to pick its role at login, including staff roles that were never
// self-signup options.
export const LOGIN_ROLES: Role[] = ['admin', 'doctor', 'patient', 'staff']
