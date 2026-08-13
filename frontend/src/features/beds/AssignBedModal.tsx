import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { assignBed } from '@/features/beds/api'
import { listPatients } from '@/features/patients/api'
import { ApiError } from '@/lib/apiClient'
import type { Bed } from '@/types/bed'
import type { PatientListItem } from '@/types/patientDirectory'

const schema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
})

type FormValues = z.infer<typeof schema>

interface AssignBedModalProps {
  bed: Bed | null
  onClose: () => void
  onAssigned: (bed: Bed) => void
}

export function AssignBedModal({ bed, onClose, onAssigned }: AssignBedModalProps) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!bed) return
    listPatients()
      .then((res) => setPatients(res.patients))
      .catch(() => setPatients([]))
  }, [bed])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: FormValues) {
    if (!bed) return

    try {
      const res = await assignBed(bed.id, values.patientId)
      toast.success(`${bed.label} assigned`)
      onAssigned(res.bed)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to assign bed'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={bed !== null}
      onClose={handleClose}
      title="Assign Bed"
      description={bed ? `Assign a patient to ${bed.label}.` : undefined}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Patient"
          error={errors.patientId?.message}
          {...register('patientId')}
          options={[
            { label: 'Select a patient', value: '' },
            ...patients.map((patient) => ({ label: patient.fullName, value: patient.id })),
          ]}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  )
}
