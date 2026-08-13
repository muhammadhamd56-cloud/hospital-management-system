import { AUTH_ROLES, ROLE_LABELS, type AuthRole } from '@/types/role'
import { cn } from '@/utils/cn'

export interface RoleSelectorProps {
  value: AuthRole
  onChange: (role: AuthRole) => void
}

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">
      {AUTH_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          onClick={() => onChange(role)}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            value === role
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'border-surface-border text-ink-muted hover:bg-surface-alt hover:text-ink',
          )}
        >
          {ROLE_LABELS[role]}
        </button>
      ))}
    </div>
  )
}
