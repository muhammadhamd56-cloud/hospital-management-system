import { ClipboardList, Pill } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime } from '@/utils/datetime'
import type { MedicalRecord } from '@/types/medicalRecord'

interface MedicalRecordListProps {
  records: MedicalRecord[]
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

export function MedicalRecordList({
  records,
  isLoading,
  emptyTitle = 'No medical records yet',
  emptyDescription,
}: MedicalRecordListProps) {
  if (isLoading) {
    return <p className="py-8 text-center text-sm text-ink-muted">Loading medical records…</p>
  }

  if (records.length === 0) {
    return <EmptyState icon={ClipboardList} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <ul className="flex flex-col gap-4">
      {records.map((record) => (
        <li key={record.id} className="rounded-lg border border-surface-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-ink">{record.diagnosis}</p>
            <p className="text-xs text-ink-muted">{formatDateTime(record.createdAt)}</p>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Dr. {record.doctorName} · {record.specialization}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{record.notes}</p>

          {record.prescriptions.length > 0 && (
            <div className="mt-4 border-t border-surface-border pt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Pill className="size-3.5" aria-hidden="true" />
                Prescriptions
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {record.prescriptions.map((prescription) => (
                  <li key={prescription.id} className="rounded-lg bg-surface-alt px-3 py-2 text-sm">
                    <p className="font-medium text-ink">
                      {prescription.medicationName} — {prescription.dosage}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {prescription.frequency} for {prescription.durationDays}{' '}
                      {prescription.durationDays === 1 ? 'day' : 'days'}
                      {prescription.instructions ? ` · ${prescription.instructions}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
