import { NavLink } from 'react-router'
import { Activity, X } from 'lucide-react'
import { NAV_ITEMS } from '@/constants/nav'
import { cn } from '@/utils/cn'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Activity className="size-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold text-ink">MediCore</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          if (!item.path) {
            return (
              <span
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted/60"
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
                <span className="ml-auto rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-medium">
                  Soon
                </span>
              </span>
            )
          }

          return (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )
              }
            >
              <item.icon className="size-5" aria-hidden="true" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop: static column */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-border bg-surface lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile: slide-in drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          isOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!isOpen}
      >
        <div
          onClick={onClose}
          className={cn(
            'absolute inset-0 bg-ink/40 transition-opacity',
            isOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl transition-transform',
            isOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <SidebarContent onNavigate={onClose} />
        </aside>
      </div>
    </>
  )
}
