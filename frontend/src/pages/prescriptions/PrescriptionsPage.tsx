import { Pill } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime } from '@/utils/datetime'
import { useMyMedicalRecords } from '@/features/patientMedicalRecords/useMyMedicalRecords'

export function PrescriptionsPage() {
  const { records, isLoading } = useMyMedicalRecords()

  const prescriptions = records
    .flatMap((record) =>
      record.prescriptions.map((prescription) => ({
        ...prescription,
        doctorName: record.doctorName,
        specialization: record.specialization,
        diagnosis: record.diagnosis,
        prescribedAt: record.createdAt,
      })),
    )
    .sort((a, b) => new Date(b.prescribedAt).getTime() - new Date(a.prescribedAt).getTime())

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Prescriptions</h1>
        <p className="text-sm text-ink-muted">All medications prescribed to you, across every visit.</p>
      </div>

      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle>Medications</CardTitle>
          <CardDescription>
            {prescriptions.length} prescription{prescriptions.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-ink-muted">Loading prescriptions…</p>
          ) : prescriptions.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="No prescriptions yet"
              description="Medications prescribed during your visits will appear here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {prescriptions.map((prescription) => (
                <li key={prescription.id} className="rounded-lg border border-surface-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">
                      {prescription.medicationName} — {prescription.dosage}
                    </p>
                    <p className="text-xs text-ink-muted">{formatDateTime(prescription.prescribedAt)}</p>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {prescription.frequency} for {prescription.durationDays}{' '}
                    {prescription.durationDays === 1 ? 'day' : 'days'}
                  </p>
                  {prescription.instructions && (
                    <p className="mt-1 text-sm text-ink">{prescription.instructions}</p>
                  )}
                  <p className="mt-2 text-xs text-ink-muted">
                    Prescribed by Dr. {prescription.doctorName} · {prescription.specialization} · for{' '}
                    {prescription.diagnosis}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
