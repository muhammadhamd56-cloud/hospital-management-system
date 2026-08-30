import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { applyToShift } from '@/features/staffPortal/api'
import { ApiError } from '@/lib/apiClient'
import type { ShiftApplication, ShiftOpening } from '@/types/staffPortal'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function ApplyShiftModal({
  opening,
  onClose,
  onApplied,
}: {
  opening: ShiftOpening | null
  onClose: () => void
  onApplied: (application: ShiftApplication) => void
}) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleClose() {
    setMessage('')
    onClose()
  }

  async function handleSubmit() {
    if (!opening) return

    setIsSubmitting(true)
    try {
      const result = await applyToShift(opening.id, { message: message.trim() || undefined })
      onApplied(result.application)
      setMessage('')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to submit application')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={opening !== null}
      onClose={handleClose}
      title="Apply for this shift"
      description={
        opening
          ? `${formatDateTime(opening.startTime)} – ${formatDateTime(opening.endTime)}${opening.department ? ` · ${opening.department}` : ''}`
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <Textarea
          label="Message to admin (optional)"
          placeholder="Anything the reviewing admin should know"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" isLoading={isSubmitting} onClick={handleSubmit}>
            Submit application
          </Button>
        </div>
      </div>
    </Modal>
  )
}
