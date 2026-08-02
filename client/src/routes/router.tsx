import { createBrowserRouter, Navigate } from 'react-router'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { PatientsPage } from '@/pages/patients/PatientsPage'
import { DoctorsPage } from '@/pages/doctors/DoctorsPage'
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
    ],
  },
  { path: '/', element: <Navigate to={ROUTES.dashboard} replace /> },
  { path: '*', element: <NotFoundPage /> },
])
