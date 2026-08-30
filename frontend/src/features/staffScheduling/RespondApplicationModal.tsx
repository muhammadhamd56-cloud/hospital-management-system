import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { respondToShiftApplication } from '@/features/staffScheduling/api'
import { ApiError } from '@/lib/apiClient'
import type { ShiftApplication } from '@/types/staffPortal'

interface RespondApplicationModalProps {
  application: ShiftApplication | null
  decision: 'approve' | 'reject' | null
  onClose: () => void
  onResponded: (application: ShiftApplication) => void
}

export function RespondApplicationModal({ application, decision, onClose, onResponded }: RespondApplicationModalProps) {
  const [adminNotes, setAdminNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleClose() {
    setAdminNotes('')
    onClose()
  }

  async function handleSubmit() {
    if (!application || !decision) return

    setIsSubmitting(true)
    try {
      const result = await respondToShiftApplication(application.id, {
        decision,
        adminNotes: adminNotes.trim() || undefined,
      })
      onResponded(result.application)
      setAdminNotes('')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : `Failed to ${decision} application`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={application !== null && decision !== null}
      onClose={handleClose}
      title={decision === 'approve' ? 'Approve application?' : 'Reject application?'}
      description={
        application
          ? `${application.staff.fullName} applied for the ${application.opening.shiftType} shift on ${new Date(application.opening.date).toLocaleDateString()}.`
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <Textarea
          label="Note to staff member (optional)"
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={decision === 'reject' ? 'danger' : 'primary'}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            {decision === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
