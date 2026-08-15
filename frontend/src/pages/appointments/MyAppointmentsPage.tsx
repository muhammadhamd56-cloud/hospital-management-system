import { usePatientAppointments } from '@/features/patientDashboard/usePatientAppointments'
import { UpcomingSessionsCard } from '@/features/patientDashboard/UpcomingSessionsCard'
import { SessionCalendar } from '@/features/patientDashboard/SessionCalendar'

export function MyAppointmentsPage() {
  const { appointments, upsertAppointment } = usePatientAppointments()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">My Appointments</h1>
        <p className="text-sm text-ink-muted">Your upcoming, past, and cancelled sessions.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="animate-fade-in xl:col-span-2">
          <UpcomingSessionsCard appointments={appointments} onCancelled={upsertAppointment} />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <SessionCalendar appointments={appointments} />
        </div>
      </div>
    </div>
  )
}
