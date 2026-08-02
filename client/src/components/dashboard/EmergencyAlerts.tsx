import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { EMERGENCY_ALERTS, type AlertPriority } from '@/features/dashboard/mockDashboardData'
import { cn } from '@/utils/cn'

const PRIORITY_CONFIG: Record<
  AlertPriority,
  { label: string; badgeVariant: 'danger' | 'warning' | 'info'; indicator: string }
> = {
  high: { label: 'High priority', badgeVariant: 'danger', indicator: 'bg-danger-500' },
  medium: { label: 'Medium priority', badgeVariant: 'warning', indicator: 'bg-warning-500' },
  low: { label: 'Low priority', badgeVariant: 'info', indicator: 'bg-info-500' },
}

export function EmergencyAlerts() {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Emergency Alerts</CardTitle>
        <CardDescription>Issues that need attention right now.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {EMERGENCY_ALERTS.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No active alerts"
            description="Everything is running smoothly."
          />
        ) : (
          EMERGENCY_ALERTS.map((alert) => {
            const config = PRIORITY_CONFIG[alert.priority]
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-alt p-3"
              >
                <span className={cn('mt-1 size-2 shrink-0 rounded-full', config.indicator)} aria-hidden="true" />
                <span className="mt-0.5 shrink-0 text-danger-600">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{alert.title}</p>
                  <p className="text-xs text-ink-muted">{alert.description}</p>
                </div>
                <Badge variant={config.badgeVariant} className="shrink-0">
                  {config.label}
                </Badge>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
