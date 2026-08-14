import {
  LayoutDashboard,
  Users,
  Stethoscope,
  CalendarClock,
  BedDouble,
  FlaskConical,
  Pill,
  Receipt,
  FileBarChart,
  Settings,
  MessageCircle,
  FileText,
  UserCog,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import type { NavItem } from '@/types/nav'

/** Primary sidebar navigation. Items without a `path` render disabled — their
 *  module hasn't been built yet — so the sidebar reflects the full intended
 *  IA without linking anywhere real. */
const OPS_ONLY: NavItem['roles'] = ['admin', 'doctor']

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.dashboard },
  { label: 'Messages', icon: MessageCircle, path: ROUTES.messages, roles: ['patient', 'doctor'] },
  {
    label: 'Medical Records',
    icon: FileText,
    path: ROUTES.medicalRecords,
    roles: ['patient', 'doctor'],
  },
  { label: 'Patients', icon: Users, path: ROUTES.patients, roles: [...OPS_ONLY!, 'receptionist'] },
  { label: 'Doctors', icon: Stethoscope, path: ROUTES.doctors, roles: OPS_ONLY },
  {
    label: 'Appointments',
    icon: CalendarClock,
    path: ROUTES.appointments,
    roles: [...OPS_ONLY!, 'receptionist'],
  },
  { label: 'Beds', icon: BedDouble, path: ROUTES.beds, roles: OPS_ONLY },
  {
    label: 'Laboratory',
    icon: FlaskConical,
    path: ROUTES.laboratory,
    roles: [...OPS_ONLY!, 'lab_staff'],
  },
  {
    label: 'Pharmacy',
    icon: Pill,
    path: ROUTES.pharmacy,
    roles: [...OPS_ONLY!, 'pharmacist'],
  },
  { label: 'Billing', icon: Receipt, path: ROUTES.billing, roles: OPS_ONLY },
  { label: 'Reports', icon: FileBarChart, path: ROUTES.reports, roles: OPS_ONLY },
  { label: 'Staff', icon: UserCog, path: ROUTES.staff, roles: ['admin'] },
  { label: 'Settings', icon: Settings, path: ROUTES.settings },
]
