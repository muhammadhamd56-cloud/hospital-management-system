import { useMemo, useState } from 'react'

/** Paginates an array client-side, clamping to the last valid page when the
 *  source data shrinks (e.g. after filtering) past the current page. */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  return { page: safePage, totalPages, pageItems, setPage }
}
