import { createBrowserRouter, Navigate } from 'react-router'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage'
import { SelectRolePage } from '@/pages/auth/SelectRolePage'
import { DashboardRouteSwitch } from '@/pages/dashboard/DashboardRouteSwitch'
import { PatientsPage } from '@/pages/patients/PatientsPage'
import { DoctorsPage } from '@/pages/doctors/DoctorsPage'
import { AppointmentsPage } from '@/pages/appointments/AppointmentsPage'
import { BedsPage } from '@/pages/beds/BedsPage'
import { LaboratoryPage } from '@/pages/laboratory/LaboratoryPage'
import { PharmacyPage } from '@/pages/pharmacy/PharmacyPage'
import { BillingPage } from '@/pages/billing/BillingPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { SettingsRouteSwitch } from '@/pages/settings/SettingsRouteSwitch'
import { MessagesRouteSwitch } from '@/pages/messages/MessagesRouteSwitch'
import { MedicalRecordsRouteSwitch } from '@/pages/medicalRecords/MedicalRecordsRouteSwitch'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute'
import { RoleRoute } from '@/routes/RoleRoute'
import { ROUTES } from '@/constants/routes'

export const router = createBrowserRouter([
  // Unguarded: the user isn't loaded yet when Google redirects back here.
  { path: ROUTES.oauthCallback, element: <OAuthCallbackPage /> },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: ROUTES.login, element: <LoginPage /> },
          { path: ROUTES.verifyEmail, element: <VerifyEmailPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: ROUTES.selectRole, element: <SelectRolePage /> }],
      },
      {
        element: <DashboardLayout />,
        children: [
          { path: ROUTES.dashboard, element: <DashboardRouteSwitch /> },
          { path: ROUTES.settings, element: <SettingsRouteSwitch /> },
          { path: ROUTES.messages, element: <MessagesRouteSwitch /> },
          { path: ROUTES.medicalRecords, element: <MedicalRecordsRouteSwitch /> },
          {
            element: <RoleRoute allow={['admin', 'doctor']} />,
            children: [
              { path: ROUTES.patients, element: <PatientsPage /> },
              { path: ROUTES.doctors, element: <DoctorsPage /> },
              { path: ROUTES.appointments, element: <AppointmentsPage /> },
              { path: ROUTES.beds, element: <BedsPage /> },
              { path: ROUTES.laboratory, element: <LaboratoryPage /> },
              { path: ROUTES.pharmacy, element: <PharmacyPage /> },
              { path: ROUTES.billing, element: <BillingPage /> },
              { path: ROUTES.reports, element: <ReportsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '/', element: <Navigate to={ROUTES.dashboard} replace /> },
  { path: '*', element: <NotFoundPage /> },
])
