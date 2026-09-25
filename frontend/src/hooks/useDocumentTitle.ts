import { useEffect } from 'react'
import { useMatches } from 'react-router'

const APP_NAME = 'MediCore HMS'

/**
 * Reads the `title` set via a route's `handle` (deepest match wins) and
 * reflects it in the browser tab, e.g. "Billing · MediCore HMS".
 */
export function useDocumentTitle() {
  const matches = useMatches()

  useEffect(() => {
    const match = [...matches].reverse().find((m) => (m.handle as { title?: string } | undefined)?.title)
    const title = (match?.handle as { title?: string } | undefined)?.title
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [matches])
}
