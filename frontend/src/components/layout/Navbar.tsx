import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Menu, Moon, Sun, CalendarDays, LogOut } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/features/auth/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { formatFullDate } from '@/utils/datetime'
import { ROLE_LABELS } from '@/types/role'
import { ROUTES } from '@/constants/routes'

interface NavbarProps {
  onMenuClick: () => void
}

const today = formatFullDate(new Date())

export function Navbar({ onMenuClick }: NavbarProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    await logout()
    setIsLoggingOut(false)
    setIsLogoutConfirmOpen(false)
    navigate(ROUTES.login)
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

        {(user?.role === 'admin' || user?.role === 'doctor') && <GlobalSearch />}

        <p className="hidden items-center gap-1.5 whitespace-nowrap text-sm text-ink-muted lg:flex">
          <CalendarDays className="size-4" aria-hidden="true" />
          {today}
        </p>
      </div>

      {/* Right: notifications, theme toggle, profile — always pinned right */}
      <div className="flex shrink-0 items-center gap-5">
        <NotificationBell />

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
            <p className="text-sm font-medium leading-tight text-ink">{user?.fullName}</p>
            <p className="text-xs leading-tight text-ink-muted">
              {user ? ROLE_LABELS[user.role] : ''}
            </p>
          </div>
          <Avatar name={user?.fullName ?? ''} size="sm" />
          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(true)}
            aria-label="Log out"
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt"
          >
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        title="Log out?"
        description="You'll need to sign in again to access your account."
        confirmLabel="Log out"
        variant="danger"
        isLoading={isLoggingOut}
      />
    </header>
  )
}
