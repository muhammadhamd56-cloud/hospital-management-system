import { Role } from '@prisma/client';

/**
 * Backend-local mirror of frontend/src/constants/routes.ts. The two repos
 * deploy separately (no shared import), so these paths are duplicated --
 * same convention already used for the `link` field on Notification (see
 * NotificationsService call sites). Keep in sync by hand.
 */
export const PAGE_PATHS = {
  dashboard: '/dashboard',
  notifications: '/notifications',
  settings: '/settings',
  messages: '/messages',
  medicalRecords: '/medical-records',
  billing: '/billing',
  announcements: '/announcements',
  findDoctor: '/find-doctor',
  bookAppointment: '/book-appointment',
  myAppointments: '/my-appointments',
  prescriptions: '/prescriptions',
  myShifts: '/my-shifts',
  availableShifts: '/available-shifts',
  myTasks: '/my-tasks',
  patients: '/patients',
  appointments: '/appointments',
  doctors: '/doctors',
  beds: '/beds',
  reports: '/reports',
  laboratory: '/laboratory',
  staff: '/staff',
  staffScheduling: '/staff-scheduling',
} as const;

export type PageKey = keyof typeof PAGE_PATHS;

/**
 * Mirrors the RoleRoute/LaboratoryRoute gates in frontend/src/routes/router.tsx
 * exactly -- this is the authorization boundary for navigate_to_page, so it
 * must never be more permissive than the real routing guards. When those
 * guards change, update this too.
 */
export const PAGES_BY_ROLE: Record<Role, PageKey[]> = {
  [Role.PATIENT]: [
    'dashboard',
    'notifications',
    'settings',
    'messages',
    'medicalRecords',
    'billing',
    'announcements',
    'findDoctor',
    'bookAppointment',
    'myAppointments',
    'prescriptions',
  ],
  [Role.DOCTOR]: [
    'dashboard',
    'notifications',
    'settings',
    'messages',
    'medicalRecords',
    'billing',
    'announcements',
    'patients',
    'appointments',
    'doctors',
    'beds',
    'reports',
    'laboratory',
  ],
  [Role.STAFF]: [
    'dashboard',
    'notifications',
    'settings',
    'medicalRecords',
    'announcements',
    'myShifts',
    'availableShifts',
    'myTasks',
    'laboratory',
  ],
  [Role.ADMIN]: [
    'dashboard',
    'notifications',
    'settings',
    'messages',
    'medicalRecords',
    'billing',
    'announcements',
    'patients',
    'appointments',
    'doctors',
    'beds',
    'reports',
    'laboratory',
    'staff',
    'staffScheduling',
  ],
};

/** Short, human description of each page -- shown to the model so it knows
 *  what exists without ever being able to invent a page that doesn't. */
export const PAGE_DESCRIPTIONS: Record<PageKey, string> = {
  dashboard: 'Dashboard -- overview/home',
  notifications: 'Notifications -- full notification list',
  settings: "Settings -- the user's own profile, account info, and password",
  messages: 'Messages -- chat conversations',
  medicalRecords: 'Medical Records',
  billing: 'Billing -- invoices and payments',
  announcements: 'Announcements',
  findDoctor: 'Find a Doctor -- browse/search doctors to book with',
  bookAppointment: 'Book Appointment',
  myAppointments: 'My Appointments -- upcoming, past, and cancelled sessions',
  prescriptions: 'Prescriptions',
  myShifts: 'My Shifts',
  availableShifts: 'Available Shifts -- open shifts staff can apply for',
  myTasks: 'My Tasks',
  patients: 'Patients directory',
  appointments: 'Appointments -- all appointments',
  doctors: 'Doctors directory',
  beds: 'Beds',
  reports: 'Reports',
  laboratory: 'Laboratory',
  staff: 'Staff directory',
  staffScheduling: 'Staff Scheduling',
};
