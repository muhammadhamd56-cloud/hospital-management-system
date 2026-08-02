import { useState, type FormEvent } from 'react'
import { Menu, Moon, Sun, Search, Bell, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTheme } from '@/hooks/useTheme'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { formatFullDate } from '@/utils/datetime'

interface NavbarProps {
  onMenuClick: () => void
}

const today = formatFullDate(new Date())

export function Navbar({ onMenuClick }: NavbarProps) {
  const { theme, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    if (search.trim()) toast('Global search is coming soon')
  }

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-surface-border bg-surface px-4 lg:px-6">
      {/* Left: menu toggle, search, date — free to shrink/wrap */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-surface-alt lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        <form
          onSubmit={handleSearchSubmit}
          className="hidden min-w-0 sm:block sm:max-w-xs lg:max-w-sm"
        >
          <Input
            label="Search"
            hideLabel
            icon={Search}
            placeholder="Search patients, doctors, appointments…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </form>

        <p className="hidden items-center gap-1.5 whitespace-nowrap text-sm text-ink-muted lg:flex">
          <CalendarDays className="size-4" aria-hidden="true" />
          {today}
        </p>
      </div>

      {/* Right: notifications, theme toggle, profile — always pinned right */}
      <div className="flex shrink-0 items-center gap-5">
        <button
          type="button"
          onClick={() => toast('No new notifications')}
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-alt"
        >
          <Bell className="size-5" aria-hidden="true" />
          <span
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger-500"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt"
        >
          {theme === 'dark' ? (
            <Sun className="size-5" aria-hidden="true" />
          ) : (
            <Moon className="size-5" aria-hidden="true" />
          )}
        </button>

        <div className="flex items-center gap-3 border-l border-surface-border pl-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-ink">Admin User</p>
            <p className="text-xs leading-tight text-ink-muted">Administrator</p>
          </div>
          <Avatar name="Admin User" size="sm" />
        </div>
      </div>
    </header>
  )
}
