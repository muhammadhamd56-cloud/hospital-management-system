import { useEffect, useState } from 'react'
import { CalendarX } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime } from '@/utils/datetime'
import { listAllAppointments, type AdminAppointment } from '@/features/appointments/api'
import { AppointmentStatusBadge } from '@/features/appointments/AppointmentStatusBadge'

export function AppointmentsTable() {
  const [appointments, setAppointments] = useState<AdminAppointment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listAllAppointments()
      .then((res) =>
        setAppointments(
          [...res.appointments]
            .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
            .slice(0, 7),
        ),
      )
      .catch(() => setAppointments([]))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Recent Appointments</CardTitle>
        <CardDescription>The latest scheduled and completed visits.</CardDescription>
      </CardHeader>
      {!isLoading && appointments.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No recent appointments"
          description="Booked appointments will appear here as they're scheduled."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((appointment) => (
              <TableRow key={appointment.id}>
                <TableCell className="font-medium text-ink">
                  {appointment.patientName}
                </TableCell>
                <TableCell>{appointment.doctorName}</TableCell>
                <TableCell>{formatDateTime(appointment.scheduledAt)}</TableCell>
                <TableCell>{appointment.department}</TableCell>
                <TableCell>
                  <AppointmentStatusBadge status={appointment.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
