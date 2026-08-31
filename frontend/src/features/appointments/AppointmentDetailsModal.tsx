import { Laptop, MapPin } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatDateTime } from '@/utils/datetime'
import { formatCurrency } from '@/utils/currency'
import type { SessionMode, SessionStatus } from '@/types/patientSession'

const STATUS_VARIANT: Record<SessionStatus, 'brand' | 'success' | 'neutral'> = {
  scheduled: 'brand',
  completed: 'success',
  cancelled: 'neutral',
}

export interface AppointmentDetailsData {
  id: string
  /** Present for the admin/doctor-facing view; absent for the patient's own appointments. */
  patientName?: string
  doctorName: string
  specialization: string
  department: string
  scheduledAt: string
  mode: SessionMode
  status: SessionStatus
  reason: string
  /** Present for the patient-facing view. */
  consultationFee?: number
}

interface AppointmentDetailsModalProps {
  appointment: AppointmentDetailsData | null
  onClose: () => void
}

export function AppointmentDetailsModal({ appointment, onClose }: AppointmentDetailsModalProps) {
  return (
    <Modal
      isOpen={Boolean(appointment)}
      onClose={onClose}
      title="Appointment details"
      description={appointment?.doctorName}
      className="max-w-lg"
    >
      {appointment && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {appointment.patientName && (
              <div>
                <p className="text-xs text-ink-muted">Patient</p>
                <p className="font-medium text-ink">{appointment.patientName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-ink-muted">Doctor</p>
              <p className="font-medium text-ink">{appointment.doctorName}</p>
              <p className="text-xs text-ink-muted">{appointment.specialization}</p>
            </div>
            <Badge variant={STATUS_VARIANT[appointment.status]}>{appointment.status}</Badge>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-ink-muted">Department</p>
              <p className="font-medium text-ink">{appointment.department}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Date &amp; Time</p>
              <p className="font-medium text-ink">{formatDateTime(appointment.scheduledAt)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Mode</p>
              <Badge variant={appointment.mode === 'online' ? 'info' : 'neutral'}>
                <span className="flex items-center gap-1">
                  {appointment.mode === 'online' ? (
                    <Laptop className="size-3" aria-hidden="true" />
                  ) : (
                    <MapPin className="size-3" aria-hidden="true" />
                  )}
                  {appointment.mode === 'online' ? 'Online' : 'In-person'}
                </span>
              </Badge>
            </div>
          </div>

          <div>
            <p className="text-xs text-ink-muted">Reason</p>
            <p className="text-sm text-ink">{appointment.reason}</p>
          </div>

          {typeof appointment.consultationFee === 'number' && appointment.consultationFee > 0 && (
            <div className="rounded-lg bg-surface-alt px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Consultation fee</span>
                <span className="font-medium text-ink">{formatCurrency(appointment.consultationFee)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
