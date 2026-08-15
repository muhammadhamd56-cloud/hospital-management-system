import { DoctorSearch } from '@/features/patientDashboard/DoctorSearch'

export function FindDoctorPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Find a Doctor</h1>
        <p className="text-sm text-ink-muted">
          Search by name or specialization, message a doctor, or book a session.
        </p>
      </div>

      <div className="animate-fade-in">
        <DoctorSearch onBooked={() => {}} />
      </div>
    </div>
  )
}
