import { useState } from 'react'
import { Mail, Phone, Star, Stethoscope, Globe, ExternalLink, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/currency'
import { formatPhoneForDisplay } from '@/lib/phone'
import { buildPublicDoctorProfileUrl } from '@/constants/routes'
import { SOCIAL_LINK_LABELS, type SocialLinkKey } from '@/constants/socialLinks'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

interface DoctorProfileModalProps {
  doctor: DirectoryDoctor | null
  onClose: () => void
}

export function DoctorProfileModal({ doctor, onClose }: DoctorProfileModalProps) {
  const [isCopied, setIsCopied] = useState(false)
  const socialLinks = doctor?.socialLinks
    ? (Object.entries(doctor.socialLinks).filter(([, url]) => url) as [SocialLinkKey, string][])
    : []

  async function handleCopyLink() {
    if (!doctor) return
    const url = `${window.location.origin}${buildPublicDoctorProfileUrl(doctor.id)}`
    await navigator.clipboard.writeText(url)
    setIsCopied(true)
    toast.success('Profile link copied to clipboard')
    setTimeout(() => setIsCopied(false), 2000)
  }

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
              {doctor.phone && (
                <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <Phone className="size-3.5" aria-hidden="true" />
                  {formatPhoneForDisplay(doctor.phone)}
                </p>
              )}
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

          {socialLinks.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Social Links</h3>
              <div className="flex flex-wrap gap-2">
                {socialLinks.map(([key, url]) => (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
                  >
                    {key === 'website' ? (
                      <Globe className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    )}
                    {SOCIAL_LINK_LABELS[key]}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Share Profile</h3>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-alt px-4 py-3">
              <code className="truncate text-sm font-medium text-ink">
                {`${window.location.origin}${buildPublicDoctorProfileUrl(doctor.id)}`}
              </code>
              <Button type="button" size="sm" variant="secondary" onClick={handleCopyLink}>
                {isCopied ? (
                  <>
                    <Check className="size-4" aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden="true" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
