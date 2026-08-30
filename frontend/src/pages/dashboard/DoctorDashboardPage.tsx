import { useAuth } from '@/features/auth/useAuth'
import { useDoctorAppointments } from '@/features/doctorDashboard/useDoctorAppointments'
import { UpcomingSessionsCard } from '@/features/doctorDashboard/UpcomingSessionsCard'
import { SessionCalendar } from '@/features/doctorDashboard/SessionCalendar'

export function DoctorDashboardPage() {
  const { user } = useAuth()
  const { appointments, isLoading, upsertAppointment } = useDoctorAppointments()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Welcome back, Dr. {user?.fullName}</h1>
        <p className="text-sm text-ink-muted">Here&apos;s an overview of your sessions.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="animate-fade-in xl:col-span-2">
          <UpcomingSessionsCard appointments={appointments} isLoading={isLoading} onUpdated={upsertAppointment} />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <SessionCalendar appointments={appointments} />
        </div>
      </div>
    </div>
  )
}
