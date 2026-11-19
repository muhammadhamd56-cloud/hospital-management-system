export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'hms-theme'

/**
 * The single source of truth for the theme is the `.dark` class on <html>.
 * index.html sets it before first paint (no flash); this module is the only
 * thing that changes it afterwards, and notifies every `useTheme` consumer so
 * charts, toggles, etc. all re-render together.
 */
type Listener = () => void

/** Plays a visual transition and must call `commit` exactly once, at the
 *  moment the new theme should take effect. */
export type ThemeTransitionRunner = (next: Theme, commit: () => void) => void

const listeners = new Set<Listener>()
let transitionRunner: ThemeTransitionRunner | null = null

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Applies a theme immediately (no animation) and persists it. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the
    // theme still applies for this session.
  }
  listeners.forEach((listener) => listener())
}

/** Lets the app-level transition layer animate theme changes. Returns an
 *  unregister function. Without a runner, toggles apply instantly. */
export function registerThemeTransition(runner: ThemeTransitionRunner): () => void {
  transitionRunner = runner
  return () => {
    if (transitionRunner === runner) transitionRunner = null
  }
}

export function toggleTheme() {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  if (transitionRunner) {
    transitionRunner(next, () => applyTheme(next))
  } else {
    applyTheme(next)
  }
}
