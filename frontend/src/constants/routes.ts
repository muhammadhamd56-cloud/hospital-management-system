export const ROUTES = {
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  oauthCallback: '/oauth/callback',
  selectRole: '/select-role',
  setPassword: '/set-password',
  dashboard: '/dashboard',
  staff: '/staff',
  staffScheduling: '/staff-scheduling',
  patients: '/patients',
  doctors: '/doctors',
  appointments: '/appointments',
  beds: '/beds',
  laboratory: '/laboratory',
  billing: '/billing',
  reports: '/reports',
  settings: '/settings',
  profile: '/profile',
  messages: '/messages',
  notifications: '/notifications',
  medicalRecords: '/medical-records',
  findDoctor: '/find-doctor',
  bookAppointment: '/book-appointment',
  myAppointments: '/my-appointments',
  prescriptions: '/prescriptions',
  myShifts: '/my-shifts',
  availableShifts: '/available-shifts',
  myTasks: '/my-tasks',
  announcements: '/announcements',
  emergency: '/emergency',
  emergencyCase: '/emergency/cases/:id',
  /** Unauthenticated -- a doctor's shareable profile link. */
  publicDoctorProfile: '/doctor/:id',
} as const

export function buildPublicDoctorProfileUrl(doctorId: string): string {
  return `/doctor/${doctorId}`
}

export function buildEmergencyCaseUrl(caseId: string): string {
  return `/emergency/cases/${caseId}`
}
