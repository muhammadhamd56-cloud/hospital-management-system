import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/utils/cn'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
  idPrefix: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext)
  if (!context) throw new Error(`<${component}> must be used inside <Tabs>`)
  return context
}

export interface TabsProps {
  defaultTab: string
  children: ReactNode
  className?: string
}

export function Tabs({ defaultTab, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  const idPrefix = useId()

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, idPrefix }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End']

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null)

  // Roving tabindex (see TabsTrigger) takes every inactive tab out of the
  // regular Tab order -- WAI-ARIA's Tabs pattern requires arrow/Home/End to
  // move between them instead, or they'd be unreachable by keyboard entirely.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ARROW_KEYS.includes(event.key)) return

    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    if (tabs.length === 0) return

    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1

    event.preventDefault()
    tabs[nextIndex].focus()
    tabs[nextIndex].click()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-surface-border bg-surface-alt p-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const { activeTab, setActiveTab, idPrefix } = useTabsContext('TabsTrigger')
  const isActive = activeTab === value

  return (
    <button
      type="button"
      role="tab"
      id={`${idPrefix}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${idPrefix}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(value)}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  const { activeTab, idPrefix } = useTabsContext('TabsContent')
  if (activeTab !== value) return null

  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      className="mt-4"
    >
      {children}
    </div>
  )
}
