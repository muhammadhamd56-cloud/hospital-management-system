import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { MessagesPage } from '@/pages/messages/MessagesPage'
import { DoctorMessagesPage } from '@/pages/messages/DoctorMessagesPage'
import { AccessDenied } from '@/routes/AccessDenied'
import { ROUTES } from '@/constants/routes'

export function MessagesRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'doctor') return <DoctorMessagesPage />
  if (user?.role === 'patient') return <MessagesPage />

  // Signed out is handled by ProtectedRoute; a signed-in role with no page here gets told so.
  if (!user) return <Navigate to={ROUTES.dashboard} replace />
  return <AccessDenied />
}
