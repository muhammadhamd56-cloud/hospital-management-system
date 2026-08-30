import { useDoctorInbox } from '@/features/doctorDashboard/useDoctorInbox'
import { DoctorInboxPanel } from '@/features/doctorDashboard/DoctorInboxPanel'

export function DoctorMessagesPage() {
  const { patients, isLoading } = useDoctorInbox()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Messages</h1>
        <p className="text-sm text-ink-muted">Conversations with your patients.</p>
      </div>

      <div className="animate-fade-in">
        <DoctorInboxPanel patients={patients} isPatientsLoading={isLoading} />
      </div>
    </div>
  )
}
