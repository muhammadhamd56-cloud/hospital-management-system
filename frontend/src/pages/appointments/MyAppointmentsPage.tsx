import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import toast from 'react-hot-toast'
import { usePatientAppointments } from '@/features/patientDashboard/usePatientAppointments'
import { UpcomingSessionsCard } from '@/features/patientDashboard/UpcomingSessionsCard'
import { SessionCalendar } from '@/features/patientDashboard/SessionCalendar'
import { AppointmentDetailsModal } from '@/features/appointments/AppointmentDetailsModal'
import type { PatientAppointment } from '@/types/patientSession'

export function MyAppointmentsPage() {
  const { appointments, isLoading, upsertAppointment } = usePatientAppointments()
  const [viewingAppointment, setViewingAppointment] = useState<PatientAppointment | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep link from a notification (e.g. an appointment reminder) -> My Appointments.
  // Left in the URL so refreshing the page re-opens the same appointment.
  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId')
    if (!appointmentId || isLoading) return

    const found = appointments.find((appointment) => appointment.id === appointmentId)
    if (found) {
      setViewingAppointment(found)
    } else {
      toast.error('This appointment is no longer available.')
      setSearchParams(
        (prev) => {
          prev.delete('appointmentId')
          return prev
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, appointments, isLoading])

  function handleCloseAppointmentModal() {
    setViewingAppointment(null)
    if (searchParams.has('appointmentId')) {
      setSearchParams(
        (prev) => {
          prev.delete('appointmentId')
          return prev
        },
        { replace: true },
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">My Appointments</h1>
        <p className="text-sm text-ink-muted">Your upcoming, past, and cancelled sessions.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="animate-fade-in xl:col-span-2">
          <UpcomingSessionsCard
            appointments={appointments}
            isLoading={isLoading}
            onCancelled={upsertAppointment}
            onView={setViewingAppointment}
          />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <SessionCalendar appointments={appointments} />
        </div>
      </div>

      <AppointmentDetailsModal appointment={viewingAppointment} onClose={handleCloseAppointmentModal} />
    </div>
  )
}
