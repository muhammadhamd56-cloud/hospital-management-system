import { useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createEmergency } from '@/features/emergency/api'
import { ApiError } from '@/lib/apiClient'
import { buildEmergencyCaseUrl } from '@/constants/routes'

export interface CreateEmergencyModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Confirmation only -- per section 4, hitting "Confirm Emergency" creates the
 * bare case immediately (no form to fill in first) so a genuine emergency is
 * never held up. Type/description/location are gathered afterward, as
 * optional follow-ups on the case's own detail page.
 */
export function CreateEmergencyModal({ isOpen, onClose }: CreateEmergencyModalProps) {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      const { emergencyCase } = await createEmergency({})
      onClose()
      navigate(buildEmergencyCaseUrl(emergencyCase.id))
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create emergency request'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Emergency assistance"
      description="Are you sure you want to create an emergency request? This will notify authorized hospital emergency staff. This is a hospital emergency request, not a call to an ambulance or external emergency service."
      confirmLabel="Confirm Emergency"
      variant="danger"
      isLoading={isSubmitting}
    />
  )
}
