import { createBrowserRouter, Navigate } from 'react-router'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage'
import { SelectRolePage } from '@/pages/auth/SelectRolePage'
import { SetPasswordPage } from '@/pages/auth/SetPasswordPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute'
import { LaboratoryRoute, RoleRoute } from '@/routes/RoleRoute'
import { ROUTES } from '@/constants/routes'

// The dashboard's own feature pages are code-split -- they're the bulk of
// the bundle and are never needed for the first paint (login/auth pages
// above stay eager since they ARE the first paint). React Router's `lazy`
// route config fetches and renders each on first visit, showing the parent
// layout's existing content until it resolves (no extra Suspense needed).
const dashboardSwitch = () => import('@/pages/dashboard/DashboardRouteSwitch').then((m) => ({ Component: m.DashboardRouteSwitch }))
const settingsSwitch = () => import('@/pages/settings/SettingsRouteSwitch').then((m) => ({ Component: m.SettingsRouteSwitch }))
const messagesSwitch = () => import('@/pages/messages/MessagesRouteSwitch').then((m) => ({ Component: m.MessagesRouteSwitch }))
const medicalRecordsSwitch = () => import('@/pages/medicalRecords/MedicalRecordsRouteSwitch').then((m) => ({ Component: m.MedicalRecordsRouteSwitch }))
const announcementsPage = () => import('@/pages/announcements/AnnouncementsPage').then((m) => ({ Component: m.AnnouncementsPage }))
const findDoctorPage = () => import('@/pages/findDoctor/FindDoctorPage').then((m) => ({ Component: m.FindDoctorPage }))
const bookAppointmentPage = () => import('@/pages/appointments/BookAppointmentPage').then((m) => ({ Component: m.BookAppointmentPage }))
const myAppointmentsPage = () => import('@/pages/appointments/MyAppointmentsPage').then((m) => ({ Component: m.MyAppointmentsPage }))
const prescriptionsPage = () => import('@/pages/prescriptions/PrescriptionsPage').then((m) => ({ Component: m.PrescriptionsPage }))
const myShiftsPage = () => import('@/pages/staffPortal/MyShiftsPage').then((m) => ({ Component: m.MyShiftsPage }))
const availableShiftsPage = () => import('@/pages/staffPortal/AvailableShiftsPage').then((m) => ({ Component: m.AvailableShiftsPage }))
const tasksPage = () => import('@/pages/staffPortal/TasksPage').then((m) => ({ Component: m.TasksPage }))
const patientsPage = () => import('@/pages/patients/PatientsPage').then((m) => ({ Component: m.PatientsPage }))
const appointmentsPage = () => import('@/pages/appointments/AppointmentsPage').then((m) => ({ Component: m.AppointmentsPage }))
const doctorsPage = () => import('@/pages/doctors/DoctorsPage').then((m) => ({ Component: m.DoctorsPage }))
const bedsPage = () => import('@/pages/beds/BedsPage').then((m) => ({ Component: m.BedsPage }))
const billingSwitch = () => import('@/pages/billing/BillingRouteSwitch').then((m) => ({ Component: m.BillingRouteSwitch }))
const reportsPage = () => import('@/pages/reports/ReportsPage').then((m) => ({ Component: m.ReportsPage }))
const laboratoryPage = () => import('@/pages/laboratory/LaboratoryPage').then((m) => ({ Component: m.LaboratoryPage }))
const staffPage = () => import('@/pages/staff/StaffPage').then((m) => ({ Component: m.StaffPage }))
const staffSchedulingPage = () => import('@/pages/staffScheduling/StaffSchedulingPage').then((m) => ({ Component: m.StaffSchedulingPage }))
const notificationsPage = () => import('@/pages/notifications/NotificationsPage').then((m) => ({ Component: m.NotificationsPage }))

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
          { path: ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
          { path: ROUTES.resetPassword, element: <ResetPasswordPage /> },
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
        children: [
          { path: ROUTES.selectRole, element: <SelectRolePage /> },
          { path: ROUTES.setPassword, element: <SetPasswordPage /> },
        ],
      },
      {
        element: <DashboardLayout />,
        children: [
          { path: ROUTES.dashboard, lazy: dashboardSwitch },
          { path: ROUTES.notifications, lazy: notificationsPage },
          { path: ROUTES.settings, lazy: settingsSwitch },
          { path: ROUTES.messages, lazy: messagesSwitch },
          { path: ROUTES.medicalRecords, lazy: medicalRecordsSwitch },
          { path: ROUTES.billing, lazy: billingSwitch },
          { path: ROUTES.announcements, lazy: announcementsPage },
          {
            element: <RoleRoute allow={['patient']} />,
            children: [
              { path: ROUTES.findDoctor, lazy: findDoctorPage },
              { path: ROUTES.bookAppointment, lazy: bookAppointmentPage },
              { path: ROUTES.myAppointments, lazy: myAppointmentsPage },
              { path: ROUTES.prescriptions, lazy: prescriptionsPage },
            ],
          },
          {
            element: <RoleRoute allow={['staff']} />,
            children: [
              { path: ROUTES.myShifts, lazy: myShiftsPage },
              { path: ROUTES.availableShifts, lazy: availableShiftsPage },
              { path: ROUTES.myTasks, lazy: tasksPage },
            ],
          },
          {
            element: <RoleRoute allow={['admin', 'doctor']} />,
            children: [
              { path: ROUTES.patients, lazy: patientsPage },
              { path: ROUTES.appointments, lazy: appointmentsPage },
              { path: ROUTES.doctors, lazy: doctorsPage },
              { path: ROUTES.beds, lazy: bedsPage },
              { path: ROUTES.reports, lazy: reportsPage },
            ],
          },
          {
            element: <LaboratoryRoute />,
            children: [{ path: ROUTES.laboratory, lazy: laboratoryPage }],
          },
          {
            element: <RoleRoute allow={['admin']} />,
            children: [
              { path: ROUTES.staff, lazy: staffPage },
              { path: ROUTES.staffScheduling, lazy: staffSchedulingPage },
            ],
          },
        ],
      },
    ],
  },
  { path: '/', element: <Navigate to={ROUTES.dashboard} replace /> },
  { path: '*', element: <NotFoundPage /> },
])
