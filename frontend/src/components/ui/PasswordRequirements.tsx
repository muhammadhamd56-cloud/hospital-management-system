import { Check, X } from 'lucide-react'
import { PASSWORD_RULES } from '@/lib/passwordPolicy'
import { cn } from '@/utils/cn'

export interface PasswordRequirementsProps {
  password: string
}

/** Live checklist shown while creating/changing a password. Purely
 *  informational -- the actual gate is server-side (and the zod schema at
 *  submit time), this just tells the user which rule they're missing
 *  without waiting for a failed submit. */
export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password)
        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5 text-xs',
              passed ? 'text-success-600 dark:text-success-400' : 'text-ink-muted',
            )}
          >
            {passed ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <X className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{passed ? ' — met' : ' — not met yet'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
