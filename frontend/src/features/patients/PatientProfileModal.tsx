import { useEffect, useState } from 'react'
import { Calendar, Mail, Stethoscope } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { getPatient } from '@/features/patients/api'
import { ApiError } from '@/lib/apiClient'
import type { PatientDetail } from '@/types/patientDirectory'
import type { SessionStatus } from '@/types/patientSession'

const STATUS_VARIANT: Record<SessionStatus, 'brand' | 'success' | 'neutral'> = {
  scheduled: 'brand',
  completed: 'success',
  cancelled: 'neutral',
}

interface PatientProfileModalProps {
  patientId: string | null
  onClose: () => void
}

export function PatientProfileModal({ patientId, onClose }: PatientProfileModalProps) {
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!patientId) return

    setIsLoading(true)
    setPatient(null)

    getPatient(patientId)
      .then((res) => setPatient(res.patient))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load patient'
        toast.error(message)
        onClose()
      })
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  return (
    <Modal isOpen={patientId !== null} onClose={onClose} title="Patient Profile">
      {isLoading || !patient ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={patient.fullName} src={patient.picture ?? undefined} size="lg" />
            <div>
              <p className="text-lg font-semibold text-ink">{patient.fullName}</p>
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <Mail className="size-3.5" aria-hidden="true" />
                {patient.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-lg border border-surface-border p-4 text-sm">
            <div>
              <p className="text-xs text-ink-muted">Joined</p>
              <p className="font-medium text-ink">{new Date(patient.joinedAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Appointments</p>
              <p className="font-medium text-ink">{patient.appointmentCount}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Last visit</p>
              <p className="font-medium text-ink">
                {patient.lastVisit ? new Date(patient.lastVisit).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">Appointment history</h3>
            {patient.appointments.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No appointments yet"
                description="This patient hasn't booked a session with any doctor."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {patient.appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between rounded-lg border border-surface-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">{appointment.doctorName}</p>
                      <p className="text-xs text-ink-muted">
                        {appointment.specialization} · {appointment.department}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                        <Calendar className="size-3.5" aria-hidden="true" />
                        {new Date(appointment.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[appointment.status]}>{appointment.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
