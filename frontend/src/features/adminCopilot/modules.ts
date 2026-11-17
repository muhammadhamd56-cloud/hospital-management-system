import { ROUTES } from '@/constants/routes'
import type { CopilotModule } from '@/features/adminCopilot/api'

const MODULE_BY_ROUTE: Array<[string, CopilotModule]> = [
  [ROUTES.dashboard, 'dashboard'],
  [ROUTES.emergency, 'emergency'],
  [ROUTES.announcements, 'announcements'],
  [ROUTES.patients, 'patients'],
  [ROUTES.doctors, 'doctors'],
  [ROUTES.appointments, 'appointments'],
  [ROUTES.beds, 'beds'],
  [ROUTES.laboratory, 'laboratory'],
  [ROUTES.billing, 'billing'],
  [ROUTES.reports, 'reports'],
  [ROUTES.staffScheduling, 'scheduling'],
  [ROUTES.staff, 'staff'],
  [ROUTES.accountApprovals, 'approvals'],
  [ROUTES.profile, 'profile'],
  [ROUTES.settings, 'settings'],
]

/** The admin module the current page belongs to. Context for the copilot only -- it grants nothing. */
export function moduleForPath(pathname: string): CopilotModule {
  const match = MODULE_BY_ROUTE.find(([route]) => pathname === route || pathname.startsWith(`${route}/`))
  return match ? match[1] : 'dashboard'
}

export const MODULE_LABELS: Record<CopilotModule, string> = {
  dashboard: 'Dashboard',
  emergency: 'Emergency',
  announcements: 'Announcements',
  patients: 'Patients',
  doctors: 'Doctors',
  appointments: 'Appointments',
  beds: 'Beds',
  laboratory: 'Laboratory',
  billing: 'Billing',
  reports: 'Reports',
  staff: 'Staff',
  approvals: 'Account Approvals',
  scheduling: 'Staff Scheduling',
  profile: 'Profile',
  settings: 'Settings',
}

export const MODULE_SUGGESTIONS: Record<CopilotModule, string[]> = {
  dashboard: ['Summarize today’s hospital activity', 'How does revenue this month compare to last month?', 'Anything unusual in the metrics?'],
  emergency: ['Which emergencies are still open?', 'Summarize emergency activity this week'],
  announcements: ['Draft an announcement about weekend visiting hours', 'Summarize recent announcements'],
  patients: ['How many patients registered this month?', 'Find a patient record by name'],
  doctors: ['Which doctors have the heaviest workload this week?', 'Any doctor schedule conflicts?'],
  appointments: ['Show booking trends for the last 30 days', 'Are there any scheduling conflicts?'],
  beds: ['What is the current bed occupancy by department?', 'Any bed record discrepancies?'],
  laboratory: ['Which lab tests are still pending?', 'Give me a lab operations status report'],
  billing: ['Summarize outstanding invoices', 'Compare revenue for the last two months', 'Any billing discrepancies?'],
  reports: ['Prepare an operations report for last month', 'What report types can you prepare?'],
  staff: ['Summarize workforce distribution', 'Who has the most open tasks?'],
  approvals: ['List pending account applications', 'Which applications are missing information?'],
  scheduling: ['Detect shift conflicts this week', 'Find coverage gaps for the next 7 days'],
  profile: ['Show my profile', 'Which profile fields can I change?'],
  settings: ['Explain the current platform settings', 'Are any settings inconsistent?'],
}
