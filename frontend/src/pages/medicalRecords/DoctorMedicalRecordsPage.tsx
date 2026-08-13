import { useDoctorInbox } from '@/features/doctorDashboard/useDoctorInbox'
import { DoctorMedicalRecordsPanel } from '@/features/doctorMedicalRecords/DoctorMedicalRecordsPanel'

export function DoctorMedicalRecordsPage() {
  const { patients } = useDoctorInbox()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Medical Records</h1>
        <p className="text-sm text-ink-muted">Write and review diagnoses for your patients.</p>
      </div>

      <div className="animate-fade-in">
        <DoctorMedicalRecordsPanel patients={patients} />
      </div>
    </div>
  )
}
