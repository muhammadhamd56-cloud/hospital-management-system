import { useState } from 'react'
import { CalendarX, Laptop, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cancelAppointment } from '@/features/patientDashboard/api'
import { formatSessionDateTime, isUpcoming } from '@/features/patientDashboard/formatSession'
import { ApiError } from '@/lib/apiClient'
import type { PatientAppointment } from '@/types/patientSession'

interface UpcomingSessionsCardProps {
  appointments: PatientAppointment[]
  onCancelled: (appointment: PatientAppointment) => void
}

function SessionRow({
  appointment,
  onCancelled,
}: {
  appointment: PatientAppointment
  onCancelled: (appointment: PatientAppointment) => void
}) {
  const [isCancelling, setIsCancelling] = useState(false)

  async function handleCancel() {
    setIsCancelling(true)
    try {
      const { appointment: updated } = await cancelAppointment(appointment.id)
      toast.success('Session cancelled')
      onCancelled(updated)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{appointment.doctorName}</p>
        <p className="truncate text-xs text-ink-muted">{appointment.specialization}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {formatSessionDateTime(appointment.scheduledAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={appointment.mode === 'online' ? 'info' : 'neutral'}>
          {appointment.mode === 'online' ? (
            <span className="flex items-center gap-1">
              <Laptop className="size-3" aria-hidden="true" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              In-person
            </span>
          )}
        </Badge>
        <Button size="sm" variant="secondary" isLoading={isCancelling} onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </li>
  )
}

export function UpcomingSessionsCard({ appointments, onCancelled }: UpcomingSessionsCardProps) {
  const upcoming = appointments.filter(
    (appointment) => appointment.status === 'scheduled' && isUpcoming(appointment.scheduledAt),
  )
  const onlineOnly = upcoming.filter((appointment) => appointment.mode === 'online')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Sessions</CardTitle>
        <CardDescription>Your scheduled online and in-person sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultTab="all">
          <TabsList>
            <TabsTrigger value="all">All upcoming</TabsTrigger>
            <TabsTrigger value="online">Online only</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No upcoming sessions"
                description="Book a session with a doctor to see it here."
              />
            ) : (
              <ul className="divide-y divide-surface-border">
                {upcoming.map((appointment) => (
                  <SessionRow key={appointment.id} appointment={appointment} onCancelled={onCancelled} />
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="online">
            {onlineOnly.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No online sessions"
                description="Book an online session with a doctor to see it here."
              />
            ) : (
              <ul className="divide-y divide-surface-border">
                {onlineOnly.map((appointment) => (
                  <SessionRow key={appointment.id} appointment={appointment} onCancelled={onCancelled} />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
