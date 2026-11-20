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
  //
  // Opening the modal is adjusted during render (re-checked whenever the URL,
  // the list, or the loading flag changes) instead of setting state in an
  // effect; only the "not found" toast + URL cleanup runs as an effect.
  const [deepLinkSource, setDeepLinkSource] = useState<{
    searchParams: URLSearchParams
    appointments: typeof appointments
    isLoading: boolean
  } | null>(null)
  if (
    deepLinkSource === null ||
    deepLinkSource.searchParams !== searchParams ||
    deepLinkSource.appointments !== appointments ||
    deepLinkSource.isLoading !== isLoading
  ) {
    setDeepLinkSource({ searchParams, appointments, isLoading })
    const deepLinkedAppointmentId = searchParams.get('appointmentId')
    const found =
      deepLinkedAppointmentId && !isLoading
        ? appointments.find((appointment) => appointment.id === deepLinkedAppointmentId)
        : undefined
    if (found) setViewingAppointment(found)
  }

  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId')
    if (!appointmentId || isLoading) return

    if (!appointments.some((appointment) => appointment.id === appointmentId)) {
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
