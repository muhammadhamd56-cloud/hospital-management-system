import { createBrowserRouter, Navigate } from 'react-router'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { PatientsPage } from '@/pages/patients/PatientsPage'
import { DoctorsPage } from '@/pages/doctors/DoctorsPage'
import { AppointmentsPage } from '@/pages/appointments/AppointmentsPage'
import { LaboratoryPage } from '@/pages/laboratory/LaboratoryPage'
import { PharmacyPage } from '@/pages/pharmacy/PharmacyPage'
import { BillingPage } from '@/pages/billing/BillingPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ROUTES } from '@/constants/routes'

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [{ path: ROUTES.login, element: <LoginPage /> }],
  },
  {
    element: <DashboardLayout />,
    children: [
      { path: ROUTES.dashboard, element: <DashboardPage /> },
      { path: ROUTES.patients, element: <PatientsPage /> },
      { path: ROUTES.doctors, element: <DoctorsPage /> },
      { path: ROUTES.appointments, element: <AppointmentsPage /> },
      { path: ROUTES.laboratory, element: <LaboratoryPage /> },
      { path: ROUTES.pharmacy, element: <PharmacyPage /> },
      { path: ROUTES.billing, element: <BillingPage /> },
      { path: ROUTES.reports, element: <ReportsPage /> },
      { path: ROUTES.settings, element: <SettingsPage /> },
    ],
  },
  { path: '/', element: <Navigate to={ROUTES.dashboard} replace /> },
  { path: '*', element: <NotFoundPage /> },
])
