import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * Warns before the user loses unsaved edits -- both an in-app navigation
 * (clicking a sidebar link, browser back button) via react-router's
 * `useBlocker`, and leaving the app entirely (closing the tab, refreshing)
 * via the native `beforeunload` event, since a data-router blocker alone
 * can't intercept that second case.
 *
 * Render a ConfirmDialog around the returned blocker: open when
 * `blocker.state === 'blocked'`, `onConfirm` -> `blocker.proceed()`,
 * `onClose` -> `blocker.reset()`.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  return blocker
}
