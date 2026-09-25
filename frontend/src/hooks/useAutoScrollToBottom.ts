import { useEffect, useRef } from 'react'

/** Keeps a scrollable container pinned to its latest content -- e.g. a chat thread after a new message arrives. */
export function useAutoScrollToBottom<T>(dep: T) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [dep])

  return containerRef
}
