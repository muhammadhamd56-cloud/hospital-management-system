import { PatientMedicalRecordsCard } from '@/features/patientMedicalRecords/PatientMedicalRecordsCard'

export function PatientMedicalRecordsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Medical Records</h1>
        <p className="text-sm text-ink-muted">Your diagnoses and prescriptions, in one place.</p>
      </div>

      <div className="animate-fade-in">
        <PatientMedicalRecordsCard />
      </div>
    </div>
  )
}
