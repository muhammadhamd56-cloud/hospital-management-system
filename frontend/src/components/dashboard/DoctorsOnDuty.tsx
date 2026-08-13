import { useEffect, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { listDoctors } from '@/features/patientDashboard/api'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

export function DoctorsOnDuty() {
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listDoctors({ limit: 6 })
      .then((res) => setDoctors(res.doctors))
      .catch(() => setDoctors([]))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Doctors On Duty</CardTitle>
        <CardDescription>Live availability across the hospital.</CardDescription>
      </CardHeader>
      <CardContent>
        {!isLoading && doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctors on duty"
            description="Doctor availability will appear here once set."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-surface-border">
            {doctors.map((doctor) => (
              <li key={doctor.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={doctor.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{doctor.fullName}</p>
                  <p className="truncate text-xs text-ink-muted">{doctor.department}</p>
                </div>
                <Badge variant={doctor.isAvailable ? 'success' : 'neutral'}>
                  {doctor.isAvailable ? 'Available' : 'Unavailable'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
