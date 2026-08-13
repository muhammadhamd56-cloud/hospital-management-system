import { useState } from 'react'
import { CalendarX, Laptop, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cancelDoctorAppointment, completeDoctorAppointment } from '@/features/doctorDashboard/api'
import { formatSessionDateTime, isUpcoming } from '@/features/patientDashboard/formatSession'
import { ApiError } from '@/lib/apiClient'
import type { DoctorAppointment } from '@/types/doctorSession'

interface UpcomingSessionsCardProps {
  appointments: DoctorAppointment[]
  onUpdated: (appointment: DoctorAppointment) => void
}

function SessionRow({
  appointment,
  onUpdated,
}: {
  appointment: DoctorAppointment
  onUpdated: (appointment: DoctorAppointment) => void
}) {
  const [pendingAction, setPendingAction] = useState<'cancel' | 'complete' | null>(null)

  async function handleCancel() {
    setPendingAction('cancel')
    try {
      const { appointment: updated } = await cancelDoctorAppointment(appointment.id)
      toast.success('Session cancelled')
      onUpdated(updated)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleComplete() {
    setPendingAction('complete')
    try {
      const { appointment: updated } = await completeDoctorAppointment(appointment.id)
      toast.success('Session marked complete')
      onUpdated(updated)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{appointment.patientName}</p>
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
        <Button
          size="sm"
          variant="secondary"
          isLoading={pendingAction === 'cancel'}
          disabled={pendingAction !== null}
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          isLoading={pendingAction === 'complete'}
          disabled={pendingAction !== null}
          onClick={handleComplete}
        >
          Mark complete
        </Button>
      </div>
    </li>
  )
}

export function UpcomingSessionsCard({ appointments, onUpdated }: UpcomingSessionsCardProps) {
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
                description="Sessions your patients book will show up here."
              />
            ) : (
              <ul className="divide-y divide-surface-border">
                {upcoming.map((appointment) => (
                  <SessionRow key={appointment.id} appointment={appointment} onUpdated={onUpdated} />
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="online">
            {onlineOnly.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No online sessions"
                description="Online sessions your patients book will show up here."
              />
            ) : (
              <ul className="divide-y divide-surface-border">
                {onlineOnly.map((appointment) => (
                  <SessionRow key={appointment.id} appointment={appointment} onUpdated={onUpdated} />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
