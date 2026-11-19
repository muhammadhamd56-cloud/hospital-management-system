import type { AuthUser } from '@/features/auth/AuthContext'

/** Who may open the Emergency pages (/emergency and /emergency/cases/:id).
 *  Patients reach their own cases; admin/doctor always respond. Role.STAFF is
 *  shared by every non-doctor staff type, so a STAFF account only passes when
 *  its linked roster row is a nurse -- mirrors the backend's
 *  EmergencyService.hasResponderAccess check. */
export function canAccessEmergency(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'patient' || user.role === 'admin' || user.role === 'doctor') return true
  return user.role === 'staff' && user.staffType === 'nurse'
}
