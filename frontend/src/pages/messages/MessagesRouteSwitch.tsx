import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/useAuth'
import { MessagesPage } from '@/pages/messages/MessagesPage'
import { DoctorMessagesPage } from '@/pages/messages/DoctorMessagesPage'
import { ROUTES } from '@/constants/routes'

export function MessagesRouteSwitch() {
  const { user } = useAuth()

  if (user?.role === 'doctor') return <DoctorMessagesPage />
  if (user?.role === 'patient') return <MessagesPage />

  return <Navigate to={ROUTES.dashboard} replace />
}
