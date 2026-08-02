import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-500',
        secondary:
          'bg-surface-alt text-ink border border-surface-border hover:bg-brand-50 ' +
          'dark:hover:bg-white/5',
        outline: 'border border-surface-border text-ink hover:bg-surface-alt',
        ghost: 'text-ink hover:bg-surface-alt',
        danger: 'bg-danger-600 text-white hover:bg-danger-500',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)
