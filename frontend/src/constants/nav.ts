import {
  LayoutDashboard,
  Users,
  Stethoscope,
  CalendarClock,
  CalendarPlus,
  CalendarCheck,
  BedDouble,
  FlaskConical,
  Pill,
  Receipt,
  FileBarChart,
  Settings,
  UserCircle,
  MessageCircle,
  FileText,
  UserCog,
  UserSearch,
  CalendarRange,
  ListTodo,
  Megaphone,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import type { NavItem } from '@/types/nav'

/** Primary sidebar navigation. Items without a `path` render disabled — their
 *  module hasn't been built yet — so the sidebar reflects the full intended
 *  IA without linking anywhere real. */
const OPS_ONLY: NavItem['roles'] = ['admin', 'doctor']

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.dashboard },
  { label: 'Find Doctor', icon: UserSearch, path: ROUTES.findDoctor, roles: ['patient'] },
  { label: 'Book Appointment', icon: CalendarPlus, path: ROUTES.bookAppointment, roles: ['patient'] },
  { label: 'My Appointments', icon: CalendarCheck, path: ROUTES.myAppointments, roles: ['patient'] },
  { label: 'Messages', icon: MessageCircle, path: ROUTES.messages, roles: ['patient', 'doctor'] },
  {
    label: 'Medical Records',
    icon: FileText,
    path: ROUTES.medicalRecords,
    roles: ['patient', 'doctor'],
  },
  { label: 'Prescriptions', icon: Pill, path: ROUTES.prescriptions, roles: ['patient'] },
  { label: 'My Shifts', icon: CalendarClock, path: ROUTES.myShifts, roles: ['staff'] },
  { label: 'Available Shifts', icon: CalendarPlus, path: ROUTES.availableShifts, roles: ['staff'] },
  { label: 'My Tasks', icon: ListTodo, path: ROUTES.myTasks, roles: ['staff'] },
  {
    label: 'Announcements',
    icon: Megaphone,
    path: ROUTES.announcements,
    roles: ['admin', 'doctor', 'staff'],
  },
  { label: 'Patients', icon: Users, path: ROUTES.patients, roles: OPS_ONLY },
  { label: 'Doctors', icon: Stethoscope, path: ROUTES.doctors, roles: OPS_ONLY },
  { label: 'Appointments', icon: CalendarClock, path: ROUTES.appointments, roles: OPS_ONLY },
  { label: 'Beds', icon: BedDouble, path: ROUTES.beds, roles: OPS_ONLY },
  {
    label: 'Laboratory',
    icon: FlaskConical,
    path: ROUTES.laboratory,
    roles: [...OPS_ONLY!, 'staff'],
    // Role.STAFF is shared by every non-doctor staff type -- only show this
    // to the ones actually working the lab.
    visible: (user) => user.role !== 'staff' || user.staffType === 'lab_technician',
  },
  { label: 'Billing', icon: Receipt, path: ROUTES.billing, roles: [...OPS_ONLY!, 'patient'] },
  { label: 'Reports', icon: FileBarChart, path: ROUTES.reports, roles: OPS_ONLY },
  { label: 'Staff', icon: UserCog, path: ROUTES.staff, roles: ['admin'] },
  { label: 'Staff Scheduling', icon: CalendarRange, path: ROUTES.staffScheduling, roles: ['admin'] },
  { label: 'Profile', icon: UserCircle, path: ROUTES.profile },
  { label: 'Settings', icon: Settings, path: ROUTES.settings },
]
