import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Visually hides the label while keeping it in the accessibility tree — for
   *  compact contexts like a toolbar search box where a floating label reads
   *  as clutter. */
  hideLabel?: boolean
  icon?: LucideIcon
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, hideLabel, icon: Icon, error, hint, id, className, ...props },
    ref,
  ) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const hintId = hint ? `${inputId}-hint` : undefined
    const errorId = error ? `${inputId}-error` : undefined

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}
        >
          {label}
        </label>
        <div className="relative">
          {Icon && (
            <Icon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={cn(hintId, errorId) || undefined}
            className={cn(
              'h-10 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-ink',
              'placeholder:text-ink-muted transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              Icon && 'pl-9',
              error && 'border-danger-500 focus-visible:outline-danger-500',
              className,
            )}
            {...props}
          />
        </div>
        {hint && !error && (
          <p id={hintId} className="text-xs text-ink-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger-600">
            {error}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
