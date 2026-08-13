import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-alt text-ink-muted',
        brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
        success: 'bg-success-50 text-success-600 dark:bg-success-500/15',
        warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15',
        danger: 'bg-danger-50 text-danger-600 dark:bg-danger-500/15',
        info: 'bg-info-50 text-info-600 dark:bg-info-500/15',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
