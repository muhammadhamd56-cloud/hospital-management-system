import { useEffect, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MedicalRecordList } from '@/features/medicalRecords/MedicalRecordList'
import { NewMedicalRecordModal } from '@/features/doctorMedicalRecords/NewMedicalRecordModal'
import { listPatientMedicalRecords } from '@/features/doctorMedicalRecords/api'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'
import type { MedicalRecord } from '@/types/medicalRecord'
import type { DoctorInboxPatient } from '@/types/doctorChatInbox'

interface DoctorMedicalRecordsPanelProps {
  patients: DoctorInboxPatient[]
}

export function DoctorMedicalRecordsPanel({ patients }: DoctorMedicalRecordsPanelProps) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      setSelectedPatientId(patients[0].patientId)
    }
  }, [patients, selectedPatientId])

  useEffect(() => {
    if (!selectedPatientId) return

    setIsLoading(true)
    listPatientMedicalRecords(selectedPatientId)
      .then((res) => setRecords(res.records))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load medical records'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [selectedPatientId])

  const selectedPatientName = patients.find((patient) => patient.patientId === selectedPatientId)?.patientName ?? null

  function handleCreated(record: MedicalRecord) {
    setRecords((prev) => [record, ...prev])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medical records</CardTitle>
        <CardDescription>Write and review diagnoses for your patients.</CardDescription>
      </CardHeader>
      <CardContent>
        {patients.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No patients yet"
            description="Once a patient books or messages you, they'll show up here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
            <ul className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
              {patients.map((patient) => (
                <li key={patient.patientId} className="shrink-0 sm:shrink">
                  <button
                    type="button"
                    onClick={() => setSelectedPatientId(patient.patientId)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      patient.patientId === selectedPatientId
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                    )}
                  >
                    <p className="truncate font-medium">{patient.patientName}</p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-end">
                <Button type="button" size="sm" onClick={() => setIsModalOpen(true)}>
                  <Plus className="size-4" aria-hidden="true" />
                  New record
                </Button>
              </div>
              <MedicalRecordList
                records={records}
                isLoading={isLoading}
                emptyDescription="Add a diagnosis to start this patient's record."
              />
            </div>
          </div>
        )}
      </CardContent>

      <NewMedicalRecordModal
        patientId={isModalOpen ? selectedPatientId : null}
        patientName={selectedPatientName}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
      />
    </Card>
  )
}
