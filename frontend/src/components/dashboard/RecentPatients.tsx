import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Users } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/EmptyState'
import { listPatients } from '@/features/patients/api'
import { formatDateTime } from '@/utils/datetime'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import type { PatientListItem } from '@/types/patientDirectory'

const MAX_PATIENTS = 5

export function RecentPatients() {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listPatients()
      .then((res) => setPatients(res.patients.slice(0, MAX_PATIENTS)))
      .catch(() => setPatients([]))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Recent Patients</CardTitle>
          <CardDescription>Newly registered patients.</CardDescription>
        </div>
        <Link
          to={ROUTES.patients}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}
        >
          View All
        </Link>
      </CardHeader>
      <CardContent>
        {!isLoading && patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No recent patients"
            description="Newly registered patients will appear here."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-surface-border">
            {patients.map((patient) => (
              <li key={patient.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={patient.fullName} src={patient.picture ?? undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{patient.fullName}</p>
                  <p className="truncate text-xs text-ink-muted">{patient.email}</p>
                </div>
                <p className="shrink-0 text-xs text-ink-muted">
                  {formatDateTime(patient.joinedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
