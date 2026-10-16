import { useState } from 'react'
import { Clock, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/useAuth'

/**
 * Where a self-registered doctor or staff account lands until an admin
 * reviews it (ProtectedRoute sends it here). The backend refuses every other
 * route for these accounts, so this page is the whole app for them for now.
 */
export function PendingApprovalPage() {
  const { user, refresh, logout } = useAuth()
  const [isChecking, setIsChecking] = useState(false)

  if (!user) return null

  const rejected = user.approvalStatus === 'rejected'
  const roleLabel = user.role === 'doctor' ? 'doctor' : 'staff'

  async function handleCheckAgain() {
    setIsChecking(true)
    try {
      // If an admin has approved the account meanwhile, ProtectedRoute
      // moves the user on to the dashboard as soon as this resolves.
      await refresh()
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <span
          className={
            rejected
              ? 'rounded-full bg-danger-50 p-3 text-danger-600'
              : 'rounded-full bg-brand-50 p-3 text-brand-600'
          }
        >
          {rejected ? <ShieldX className="size-7" aria-hidden="true" /> : <Clock className="size-7" aria-hidden="true" />}
        </span>

        <div role="status" aria-live="polite">
          <h1 className="text-lg font-semibold text-ink">
            {rejected ? 'Your account request was not approved' : 'Your account is awaiting approval'}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {rejected
              ? 'An administrator reviewed your request and did not approve it.'
              : `Because ${roleLabel} accounts can see patient information, an administrator needs to confirm yours before you can use MediCore. We'll email ${user.email} once it's reviewed.`}
          </p>
        </div>

        {rejected && user.approvalNote && (
          <p className="w-full rounded-lg border border-surface-border bg-surface-alt px-4 py-3 text-left text-sm text-ink">
            <span className="font-medium">Reason: </span>
            {user.approvalNote}
          </p>
        )}

        <p className="text-xs text-ink-muted">
          {rejected
            ? 'If you think this is a mistake, contact the hospital administration.'
            : 'You can close this page and sign in again later.'}
        </p>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {!rejected && (
            <Button type="button" onClick={handleCheckAgain} isLoading={isChecking}>
              Check again
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
