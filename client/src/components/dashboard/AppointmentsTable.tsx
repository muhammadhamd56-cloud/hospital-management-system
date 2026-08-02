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
import { formatTime } from '@/utils/datetime'
import { MOCK_APPOINTMENTS } from '@/features/appointments/mockAppointments'
import { AppointmentStatusBadge } from '@/features/appointments/AppointmentStatusBadge'

const RECENT_APPOINTMENTS = [...MOCK_APPOINTMENTS]
  .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
  .slice(0, 7)

export function AppointmentsTable() {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Recent Appointments</CardTitle>
        <CardDescription>The latest scheduled and completed visits.</CardDescription>
      </CardHeader>
      {RECENT_APPOINTMENTS.length === 0 ? (
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
            {RECENT_APPOINTMENTS.map((appointment) => (
              <TableRow key={appointment.id}>
                <TableCell className="font-medium text-ink">
                  {appointment.patientName}
                </TableCell>
                <TableCell>{appointment.doctorName}</TableCell>
                <TableCell>{formatTime(appointment.time)}</TableCell>
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
