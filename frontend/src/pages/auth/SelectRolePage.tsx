import { useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { Stethoscope, UserRound, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import type { AuthRole } from '@/types/role'
import { cn } from '@/utils/cn'

interface RoleOption {
  value: AuthRole
  label: string
  description: string
  icon: LucideIcon
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'patient',
    label: 'Patient',
    description: 'Book appointments and message your care team',
    icon: UserRound,
  },
  {
    value: 'doctor',
    label: 'Doctor',
    description: 'Manage your schedule, patients, and availability',
    icon: Stethoscope,
  },
]

export function SelectRolePage() {
  const { selectRole } = useAuth()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState<AuthRole | null>(null)

  async function handleSelect(role: AuthRole) {
    setIsSubmitting(role)
    try {
      await selectRole(role)
      toast.success("You're all set")
      navigate(ROUTES.dashboard, { replace: true })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to set your role'
      toast.error(message)
      setIsSubmitting(null)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">One more step</h1>
          <p className="mt-1 text-sm text-ink-muted">
            How will you be using MediCore? This can&apos;t be changed yourself later.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isSubmitting !== null}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-surface-border p-4 text-left transition-colors',
                'hover:border-brand-500 hover:bg-surface-alt disabled:opacity-60',
              )}
            >
              <option.icon className="size-6 shrink-0 text-brand-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ink">{option.label}</p>
                <p className="text-xs text-ink-muted">{option.description}</p>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
