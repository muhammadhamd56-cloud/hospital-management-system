import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Total item count, shown as "Showing X–Y of Z" when provided. */
  totalItems?: number
  pageSize?: number
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const rangeStart = totalItems && pageSize ? (page - 1) * pageSize + 1 : undefined
  const rangeEnd =
    totalItems && pageSize ? Math.min(page * pageSize, totalItems) : undefined

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col-reverse items-center justify-between gap-3 border-t border-surface-border px-4 py-3 sm:flex-row"
    >
      {rangeStart !== undefined && (
        <p className="text-sm text-ink-muted">
          Showing {rangeStart}–{rangeEnd} of {totalItems}
        </p>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === page ? 'page' : undefined}
            className={cn(
              'size-8 rounded-lg text-sm font-medium transition-colors',
              pageNumber === page
                ? 'bg-brand-600 text-white'
                : 'text-ink-muted hover:bg-surface-alt',
            )}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
