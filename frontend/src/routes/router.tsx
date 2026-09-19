import { createBrowserRouter, Navigate, Outlet } from 'react-router'
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
import { PublicDoctorProfilePage } from '@/pages/doctors/PublicDoctorProfilePage'
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute'
import { LaboratoryRoute, RoleRoute } from '@/routes/RoleRoute'
import { RouteErrorBoundary } from '@/routes/RouteErrorBoundary'
import { ROUTES } from '@/constants/routes'

// The dashboard's own feature pages are code-split -- they're the bulk of
// the bundle and are never needed for the first paint (login/auth pages
// above stay eager since they ARE the first paint). React Router's `lazy`
// route config fetches and renders each on first visit, showing the parent
// layout's existing content until it resolves (no extra Suspense needed).
const dashboardSwitch = () => import('@/pages/dashboard/DashboardRouteSwitch').then((m) => ({ Component: m.DashboardRouteSwitch }))
const settingsSwitch = () => import('@/pages/settings/SettingsRouteSwitch').then((m) => ({ Component: m.SettingsRouteSwitch }))
const profileSwitch = () => import('@/pages/profile/ProfileRouteSwitch').then((m) => ({ Component: m.ProfileRouteSwitch }))
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
  {
    // Root layout route so a single boundary catches errors from any route
    // below, including a lazy-loaded chunk failing to fetch (e.g. after a
    // redeploy invalidates the hashed filename this tab still has cached).
    element: <Outlet />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Unguarded: the user isn't loaded yet when Google redirects back here.
      { path: ROUTES.oauthCallback, element: <OAuthCallbackPage /> },
      // Unguarded: a doctor's shareable profile link, viewable by anyone.
      { path: ROUTES.publicDoctorProfile, element: <PublicDoctorProfilePage /> },
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: ROUTES.login, element: <LoginPage />, handle: { title: 'Sign In' } },
              { path: ROUTES.forgotPassword, element: <ForgotPasswordPage />, handle: { title: 'Forgot Password' } },
              { path: ROUTES.resetPassword, element: <ResetPasswordPage />, handle: { title: 'Reset Password' } },
              { path: ROUTES.verifyEmail, element: <VerifyEmailPage />, handle: { title: 'Verify Email' } },
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
              { path: ROUTES.selectRole, element: <SelectRolePage />, handle: { title: 'Select Role' } },
              { path: ROUTES.setPassword, element: <SetPasswordPage />, handle: { title: 'Set Password' } },
            ],
          },
          {
            element: <DashboardLayout />,
            children: [
              { path: ROUTES.dashboard, lazy: dashboardSwitch, handle: { title: 'Dashboard' } },
              { path: ROUTES.notifications, lazy: notificationsPage, handle: { title: 'Notifications' } },
              { path: ROUTES.settings, lazy: settingsSwitch, handle: { title: 'Settings' } },
              { path: ROUTES.profile, lazy: profileSwitch, handle: { title: 'Profile' } },
              { path: ROUTES.messages, lazy: messagesSwitch, handle: { title: 'Messages' } },
              { path: ROUTES.medicalRecords, lazy: medicalRecordsSwitch, handle: { title: 'Medical Records' } },
              { path: ROUTES.billing, lazy: billingSwitch, handle: { title: 'Billing' } },
              { path: ROUTES.announcements, lazy: announcementsPage, handle: { title: 'Announcements' } },
              {
                element: <RoleRoute allow={['patient']} />,
                children: [
                  { path: ROUTES.findDoctor, lazy: findDoctorPage, handle: { title: 'Find a Doctor' } },
                  { path: ROUTES.bookAppointment, lazy: bookAppointmentPage, handle: { title: 'Book Appointment' } },
                  { path: ROUTES.myAppointments, lazy: myAppointmentsPage, handle: { title: 'My Appointments' } },
                  { path: ROUTES.prescriptions, lazy: prescriptionsPage, handle: { title: 'Prescriptions' } },
                ],
              },
              {
                element: <RoleRoute allow={['staff']} />,
                children: [
                  { path: ROUTES.myShifts, lazy: myShiftsPage, handle: { title: 'My Shifts' } },
                  { path: ROUTES.availableShifts, lazy: availableShiftsPage, handle: { title: 'Available Shifts' } },
                  { path: ROUTES.myTasks, lazy: tasksPage, handle: { title: 'My Tasks' } },
                ],
              },
              {
                element: <RoleRoute allow={['admin', 'doctor']} />,
                children: [
                  { path: ROUTES.patients, lazy: patientsPage, handle: { title: 'Patients' } },
                  { path: ROUTES.appointments, lazy: appointmentsPage, handle: { title: 'Appointments' } },
                  { path: ROUTES.doctors, lazy: doctorsPage, handle: { title: 'Doctors' } },
                  { path: ROUTES.beds, lazy: bedsPage, handle: { title: 'Beds' } },
                ],
              },
              {
                element: <LaboratoryRoute />,
                children: [{ path: ROUTES.laboratory, lazy: laboratoryPage, handle: { title: 'Laboratory' } }],
              },
              {
                element: <RoleRoute allow={['admin']} />,
                children: [
                  { path: ROUTES.reports, lazy: reportsPage, handle: { title: 'Reports' } },
                  { path: ROUTES.staff, lazy: staffPage, handle: { title: 'Staff' } },
                  { path: ROUTES.staffScheduling, lazy: staffSchedulingPage, handle: { title: 'Staff Scheduling' } },
                ],
              },
            ],
          },
        ],
      },
      { path: '/', element: <Navigate to={ROUTES.dashboard} replace /> },
      { path: '*', element: <NotFoundPage />, handle: { title: 'Page Not Found' } },
    ],
  },
])
