import { useSyncExternalStore } from 'react'
import { getTheme, subscribeTheme, toggleTheme, type Theme } from '@/features/theme/themeStore'

const getServerTheme = (): Theme => 'light'

/** The current theme plus a toggle. Every caller shares one store (the `.dark`
 *  class on <html>), so a toggle anywhere re-renders all consumers. Toggling
 *  plays the global wipe transition when `ThemeTransitionLayer` is mounted. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme)
  return { theme, toggleTheme }
}
