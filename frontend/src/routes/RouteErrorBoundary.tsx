import { useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { buttonVariants } from '@/components/ui/button-variants'
import { ROUTES } from '@/constants/routes'

// Vite fetches each route's JS chunk by a hashed filename. If the app was
// redeployed (or the dev server restarted) after this tab loaded, the chunk
// the browser asks for no longer exists and the dynamic import rejects with
// this message -- reloading picks up the current chunk map and fixes it.
function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /fetch dynamically imported module|error loading dynamically imported module/i.test(message)
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  const staleChunk = isStaleChunkError(error)
  const status = isRouteErrorResponse(error) ? error.status : undefined

  useEffect(() => {
    // Skip stale-chunk reloads and 404s -- neither is an actual bug to report.
    if (staleChunk || status === 404) return
    Sentry.captureException(error)
  }, [error, staleChunk, status])

  const title = staleChunk
    ? 'This app was just updated'
    : status === 404
      ? 'Page not found'
      : 'Something went wrong'
  const description = staleChunk
    ? 'Reload the page to load the latest version.'
    : "We hit an unexpected error loading this page. You can try reloading, or head back to the dashboard."

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-alt p-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={buttonVariants({ variant: 'primary' })}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Reload page
        </button>
        <Link to={ROUTES.dashboard} className={buttonVariants({ variant: 'secondary' })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
