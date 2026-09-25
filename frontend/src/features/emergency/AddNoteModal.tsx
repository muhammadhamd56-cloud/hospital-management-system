import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { addEmergencyNote } from '@/features/emergency/api'
import { ApiError } from '@/lib/apiClient'
import type { EmergencyCaseDetail } from '@/types/emergency'

export interface AddNoteModalProps {
  isOpen: boolean
  caseId: string
  onClose: () => void
  onAdded: (emergencyCase: EmergencyCaseDetail) => void
}

export function AddNoteModal({ isOpen, caseId, onClose, onAdded }: AddNoteModalProps) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleClose() {
    setBody('')
    onClose()
  }

  async function handleSubmit() {
    if (!body.trim()) {
      toast.error('Note cannot be empty')
      return
    }

    setIsSubmitting(true)
    try {
      const { emergencyCase } = await addEmergencyNote(caseId, body.trim())
      onAdded(emergencyCase)
      toast.success('Note added')
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to add note'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Note" description="Add an operational or clinical note to this case.">
      <div className="flex flex-col gap-4">
        <Textarea label="Note" hideLabel value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" isLoading={isSubmitting} onClick={handleSubmit}>
            Add note
          </Button>
        </div>
      </div>
    </Modal>
  )
}
