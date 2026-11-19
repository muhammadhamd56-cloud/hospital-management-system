import { Link } from 'react-router'
import { ShieldX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { ROUTES } from '@/constants/routes'

/** Shown in place of a page the signed-in user's role can't open, instead of
 *  silently bouncing them to /dashboard. Rendered inside DashboardLayout so
 *  the sidebar stays put. Pure render with no side effects, so StrictMode's
 *  double render can't fire anything twice. */
export function AccessDenied() {
  return (
    <div
      role="alert"
      className="flex animate-fade-in flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15">
        <ShieldX className="size-7" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold text-ink">You don&apos;t have access to this page</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your account&apos;s role doesn&apos;t include this section. If you think that&apos;s a mistake, ask an
          administrator.
        </p>
      </div>
      <Link to={ROUTES.dashboard} className={buttonVariants({ variant: 'primary' })}>
        Back to dashboard
      </Link>
    </div>
  )
}
