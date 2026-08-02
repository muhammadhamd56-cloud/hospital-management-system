import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/utils/cn'

export interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  /** Percentage change vs. the previous period; sign determines trend color. */
  trend?: number
}

export function StatCard({ label, value, icon: Icon, trend }: StatCardProps) {
  const isPositive = typeof trend === 'number' && trend >= 0
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      {typeof trend === 'number' && (
        <p
          className={cn(
            'mt-3 flex items-center gap-1 text-xs font-medium',
            isPositive ? 'text-success-600' : 'text-danger-600',
          )}
        >
          <TrendIcon className="size-3.5" aria-hidden="true" />
          {Math.abs(trend)}% vs last month
        </p>
      )}
    </Card>
  )
}
