import { Mail, Star, Stethoscope } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/utils/currency'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

interface DoctorProfileModalProps {
  doctor: DirectoryDoctor | null
  onClose: () => void
}

export function DoctorProfileModal({ doctor, onClose }: DoctorProfileModalProps) {
  return (
    <Modal isOpen={doctor !== null} onClose={onClose} title="Doctor Profile">
      {doctor && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={doctor.fullName} size="lg" />
            <div>
              <p className="text-lg font-semibold text-ink">{doctor.fullName}</p>
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <Mail className="size-3.5" aria-hidden="true" />
                {doctor.email ?? 'No account'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-surface-border p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-muted">Specialization</p>
              <p className="font-medium text-ink">{doctor.specialization}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Department</p>
              <p className="font-medium text-ink">{doctor.department}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Experience</p>
              <p className="font-medium text-ink">{doctor.experienceYears} yrs</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Rating</p>
              <p className="flex items-center gap-1 font-medium text-ink">
                <Star className="size-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />
                {doctor.rating.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Consultation fee</p>
              <p className="font-medium text-ink">
                {doctor.consultationFee > 0 ? formatCurrency(doctor.consultationFee) : 'Free'}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Appointment duration</p>
              <p className="font-medium text-ink">{doctor.appointmentDurationMinutes} min</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={doctor.isAvailable ? 'success' : 'neutral'}>
              {doctor.isAvailable ? 'Available' : 'Unavailable'}
            </Badge>
            <Badge variant={doctor.acceptsOnline ? 'brand' : 'neutral'}>
              {doctor.acceptsOnline ? 'Accepts online sessions' : 'In-person only'}
            </Badge>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Stethoscope className="size-4" aria-hidden="true" />
              Bio
            </h3>
            <p className="text-sm text-ink-muted">{doctor.bio}</p>
          </div>
        </div>
      )}
    </Modal>
  )
}
