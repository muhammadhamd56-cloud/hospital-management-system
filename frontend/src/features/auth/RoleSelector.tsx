import { ROLE_LABELS, type Role } from '@/types/role'
import { cn } from '@/utils/cn'

export interface RoleSelectorProps<T extends Role = Role> {
  roles: T[]
  value: T
  onChange: (role: T) => void
}

export function RoleSelector<T extends Role = Role>({ roles, value, onChange }: RoleSelectorProps<T>) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Account type">
      {roles.map((role) => (
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
