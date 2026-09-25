import toast from 'react-hot-toast'
import { buildPublicDoctorProfileUrl } from '@/constants/routes'

interface ShareableDoctor {
  id: string
  fullName: string
  specialization: string
}

/** Opens the OS share sheet (WhatsApp, Messages, Email, etc.) when available, falling back to copying the link. */
export async function shareDoctorProfile(doctor: ShareableDoctor): Promise<void> {
  const url = `${window.location.origin}${buildPublicDoctorProfileUrl(doctor.id)}`
  const shareData = {
    title: `Dr. ${doctor.fullName}`,
    text: `Check out Dr. ${doctor.fullName} (${doctor.specialization}) on MediCore HMS`,
    url,
  }

  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
    } catch (error) {
      // AbortError just means the user closed the share sheet -- not a failure.
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error('Could not share the profile')
      }
    }
    return
  }

  try {
    await navigator.clipboard.writeText(url)
    toast.success('Profile link copied to clipboard')
  } catch {
    toast.error('Could not copy the link')
  }
}
