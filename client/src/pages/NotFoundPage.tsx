import { Link } from 'react-router'
import { CompassIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { ROUTES } from '@/constants/routes'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-alt p-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <CompassIcon className="size-7" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-3xl font-semibold text-ink">404</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link to={ROUTES.dashboard} className={buttonVariants({ variant: 'primary' })}>
        Back to dashboard
      </Link>
    </div>
  )
}
