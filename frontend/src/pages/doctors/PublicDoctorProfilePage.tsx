import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Activity, Mail, Star, Stethoscope, Globe, ExternalLink, CompassIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/utils/currency'
import { getPublicDoctorProfile } from '@/features/doctors/publicApi'
import { ApiError } from '@/lib/apiClient'
import { SOCIAL_LINK_LABELS, type SocialLinkKey } from '@/constants/socialLinks'
import type { PublicDoctorProfile } from '@/types/publicDoctorProfile'

export function PublicDoctorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [doctor, setDoctor] = useState<PublicDoctorProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    getPublicDoctorProfile(id)
      .then((res) => {
        setDoctor(res.doctor)
        document.title = `${res.doctor.fullName} · MediCore HMS`
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true)
        }
      })
      .finally(() => setIsLoading(false))
  }, [id])

  const socialLinks = doctor?.socialLinks
    ? (Object.entries(doctor.socialLinks).filter(([, url]) => url) as [SocialLinkKey, string][])
    : []

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-alt p-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Activity className="size-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold text-ink">MediCore HMS</span>
      </div>

      <div className="w-full max-w-lg rounded-card border border-surface-border bg-surface p-6 shadow-sm">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-ink-muted">Loading profile…</p>
        ) : notFound || !doctor ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <CompassIcon className="size-7" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold text-ink">Profile not found</p>
              <p className="mt-1 text-sm text-ink-muted">This doctor profile doesn&apos;t exist or has been removed.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={doctor.fullName} size="xl" />
              <div>
                <p className="text-xl font-semibold text-ink">{doctor.fullName}</p>
                <p className="text-sm text-ink-muted">{doctor.specialization}</p>
                {doctor.qualifications && <p className="text-xs text-ink-muted">{doctor.qualifications}</p>}
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

            <div className="grid grid-cols-2 gap-4 rounded-lg border border-surface-border p-4 text-sm">
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
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Stethoscope className="size-4" aria-hidden="true" />
                About
              </h3>
              <p className="text-sm text-ink-muted">{doctor.bio}</p>
            </div>

            {socialLinks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Connect</h3>
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

            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Mail className="size-3.5" aria-hidden="true" />
              Sign in to MediCore HMS to book a session or send a message.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
