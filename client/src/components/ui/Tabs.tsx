import {
  createContext,
  useContext,
  useId,
  useState,
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

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
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
