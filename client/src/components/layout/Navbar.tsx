import { Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { Avatar } from '@/components/ui/Avatar'

interface NavbarProps {
  onMenuClick: () => void
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex h-16 items-center gap-4 border-b border-surface-border bg-surface px-4 lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <div className="flex-1" />

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
    </header>
  )
}
