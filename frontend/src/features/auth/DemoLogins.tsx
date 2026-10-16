import { useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import { LOGIN_ROLES, ROLE_LABELS, type Role } from '@/types/role'

// Seeded by backend/api/scripts/seed-demo.ts -- keep in sync with
// backend/api/src/demo/demo-accounts.ts.
const DEMO_PASSWORD = 'Demo@1234'

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

/** One-click sign-in as each seeded demo account, for the public portfolio demo. */
export function DemoLogins() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [pendingRole, setPendingRole] = useState<Role | null>(null)

  async function signInAs(role: Role) {
    setPendingRole(role)
    try {
      await login({ email: `${role}@demo.hms`, password: DEMO_PASSWORD, role })
      toast.success(`Signed in as demo ${ROLE_LABELS[role].toLowerCase()}`)
      navigate(ROUTES.dashboard)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setPendingRole(null)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-dashed border-surface-border p-3">
      <p className="text-center text-sm text-ink-muted">Exploring the demo? Sign in instantly as:</p>
      <div className="grid grid-cols-2 gap-2">
        {LOGIN_ROLES.map((role) => (
          <Button
            key={role}
            variant="outline"
            size="sm"
            isLoading={pendingRole === role}
            disabled={pendingRole !== null}
            onClick={() => signInAs(role)}
          >
            {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>
    </div>
  )
}
