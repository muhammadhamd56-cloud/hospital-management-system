import { useSearchParams } from 'react-router'
import { usePatientAppointments } from '@/features/patientDashboard/usePatientAppointments'
import { DoctorChatPanel } from '@/features/patientDashboard/DoctorChatPanel'

export function MessagesPage() {
  const { appointments, isLoading } = usePatientAppointments()
  const [searchParams] = useSearchParams()
  const initialDoctorId = searchParams.get('doctorId')

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Messages</h1>
        <p className="text-sm text-ink-muted">
          Chat with your care team.
        </p>
      </div>

      <div className="animate-fade-in">
        <DoctorChatPanel appointments={appointments} isAppointmentsLoading={isLoading} initialDoctorId={initialDoctorId} />
      </div>
    </div>
  )
}
