import {
  LayoutDashboard,
  Users,
  Stethoscope,
  CalendarClock,
  FlaskConical,
  Pill,
  Receipt,
  FileBarChart,
  Settings,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import type { NavItem } from '@/types/nav'

/** Primary sidebar navigation. Items without a `path` render disabled — their
 *  module hasn't been built yet — so the sidebar reflects the full intended
 *  IA without linking anywhere real. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.dashboard },
  { label: 'Patients', icon: Users, path: ROUTES.patients },
  { label: 'Doctors', icon: Stethoscope, path: ROUTES.doctors },
  { label: 'Appointments', icon: CalendarClock, path: ROUTES.appointments },
  { label: 'Laboratory', icon: FlaskConical, path: ROUTES.laboratory },
  { label: 'Pharmacy', icon: Pill, path: ROUTES.pharmacy },
  { label: 'Billing', icon: Receipt, path: ROUTES.billing },
  { label: 'Reports', icon: FileBarChart, path: ROUTES.reports },
  { label: 'Settings', icon: Settings, path: ROUTES.settings },
]
