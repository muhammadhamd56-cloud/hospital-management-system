import { useNavigate } from 'react-router'
import { Card, CardContent } from '@/components/ui/Card'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { ROUTES } from '@/constants/routes'

/** Forced step for admin-provisioned staff accounts, gated by mustChangePassword in ProtectedRoute. */
export function SetPasswordPage() {
  const navigate = useNavigate()

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">Set your password</h1>
          <p className="mt-1 text-sm text-ink-muted">
            An admin created this account with a temporary password. Enter it as your current
            password, then choose a new one to continue.
          </p>
        </div>
        <SetPasswordCard onSuccess={() => navigate(ROUTES.dashboard, { replace: true })} />
      </CardContent>
    </Card>
  )
}
