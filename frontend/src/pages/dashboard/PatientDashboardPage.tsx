import { useAuth } from '@/features/auth/useAuth'
import { usePatientAppointments } from '@/features/patientDashboard/usePatientAppointments'
import { UpcomingSessionsCard } from '@/features/patientDashboard/UpcomingSessionsCard'
import { SessionCalendar } from '@/features/patientDashboard/SessionCalendar'
import { DoctorSearch } from '@/features/patientDashboard/DoctorSearch'

export function PatientDashboardPage() {
  const { user } = useAuth()
  const { appointments, upsertAppointment } = usePatientAppointments()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Welcome back, {user?.fullName}</h1>
        <p className="text-sm text-ink-muted">
          Here&apos;s an overview of your sessions and care team.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="animate-fade-in xl:col-span-2">
          <UpcomingSessionsCard appointments={appointments} onCancelled={upsertAppointment} />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <SessionCalendar appointments={appointments} />
        </div>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
        <DoctorSearch onBooked={upsertAppointment} />
      </div>
    </div>
  )
}
