import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/utils/cn'

export interface DashboardStatCardProps {
  label: string
  value: string
  icon: LucideIcon
  trend: number
  updatedLabel: string
  onClick?: () => void
}

export function DashboardStatCard({
  label,
  value,
  icon: Icon,
  trend,
  updatedLabel,
  onClick,
}: DashboardStatCardProps) {
  const isPositive = trend >= 0
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight

  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md',
        onClick && 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-2.5 text-white shadow-sm">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            isPositive ? 'text-success-600' : 'text-danger-600',
          )}
        >
          <TrendIcon className="size-3.5" aria-hidden="true" />
          {Math.abs(trend)}% vs last month
        </p>
        <p className="text-xs text-ink-muted">{updatedLabel}</p>
      </div>
    </Card>
  )
}
