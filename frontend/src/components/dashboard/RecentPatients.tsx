import { Link } from 'react-router'
import { Users } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/EmptyState'
import { RECENT_PATIENTS } from '@/features/dashboard/mockDashboardData'
import { formatDateTime } from '@/utils/datetime'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'

export function RecentPatients() {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Recent Patients</CardTitle>
          <CardDescription>Newly admitted patients.</CardDescription>
        </div>
        <Link
          to={ROUTES.patients}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}
        >
          View All
        </Link>
      </CardHeader>
      <CardContent>
        {RECENT_PATIENTS.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No recent patients"
            description="Newly admitted patients will appear here."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-surface-border">
            {RECENT_PATIENTS.map((patient) => (
              <li key={patient.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{patient.name}</p>
                  <p className="text-xs capitalize text-ink-muted">
                    {patient.gender}, {patient.age} yrs
                  </p>
                </div>
                <p className="shrink-0 text-xs text-ink-muted">
                  {formatDateTime(patient.admittedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
