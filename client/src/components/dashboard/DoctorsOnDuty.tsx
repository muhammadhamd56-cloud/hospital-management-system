import { Stethoscope } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { MOCK_DOCTORS } from '@/features/doctors/mockDoctors'
import { DoctorStatusBadge } from '@/features/doctors/DoctorStatusBadge'

const ON_DUTY_DOCTORS = MOCK_DOCTORS.filter((doctor) => doctor.status !== 'on-leave').slice(0, 6)

export function DoctorsOnDuty() {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Doctors On Duty</CardTitle>
        <CardDescription>Currently available or in surgery.</CardDescription>
      </CardHeader>
      <CardContent>
        {ON_DUTY_DOCTORS.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctors on duty"
            description="Doctor shifts will appear here once scheduled."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-surface-border">
            {ON_DUTY_DOCTORS.map((doctor) => (
              <li key={doctor.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={doctor.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{doctor.name}</p>
                  <p className="truncate text-xs text-ink-muted">{doctor.department}</p>
                </div>
                <DoctorStatusBadge status={doctor.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
