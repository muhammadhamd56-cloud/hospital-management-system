import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createMedicalRecord } from '@/features/doctorMedicalRecords/api'
import { ApiError } from '@/lib/apiClient'
import type { MedicalRecord } from '@/types/medicalRecord'

const prescriptionSchema = z.object({
  medicationName: z.string().min(1, 'Required'),
  dosage: z.string().min(1, 'Required'),
  frequency: z.string().min(1, 'Required'),
  durationDays: z.coerce.number().int().min(1, 'Min 1 day').max(365, 'Max 365 days'),
  instructions: z.string().optional(),
})

const newRecordSchema = z.object({
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  notes: z.string().min(1, 'Notes are required'),
  prescriptions: z.array(prescriptionSchema),
})

type NewRecordFormValues = z.input<typeof newRecordSchema>

interface NewMedicalRecordModalProps {
  patientId: string | null
  patientName: string | null
  onClose: () => void
  onCreated: (record: MedicalRecord) => void
}

export function NewMedicalRecordModal({
  patientId,
  patientName,
  onClose,
  onCreated,
}: NewMedicalRecordModalProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewRecordFormValues>({
    resolver: zodResolver(newRecordSchema),
    defaultValues: { diagnosis: '', notes: '', prescriptions: [] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'prescriptions' })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: NewRecordFormValues) {
    if (!patientId) return

    const parsed = newRecordSchema.parse(values)

    try {
      const { record } = await createMedicalRecord(patientId, {
        diagnosis: parsed.diagnosis,
        notes: parsed.notes,
        prescriptions: parsed.prescriptions.length ? parsed.prescriptions : undefined,
      })
      toast.success('Medical record added')
      onCreated(record)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={Boolean(patientId)}
      onClose={handleClose}
      title="New medical record"
      description={patientName ? `For ${patientName}` : undefined}
      className="max-w-2xl"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Textarea label="Diagnosis" error={errors.diagnosis?.message} {...register('diagnosis')} />
        <Textarea label="Notes" error={errors.notes?.message} {...register('notes')} />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Prescriptions</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                append({ medicationName: '', dosage: '', frequency: '', durationDays: 1, instructions: '' })
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Add prescription
            </Button>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-surface-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <Input
                    label="Medication"
                    error={errors.prescriptions?.[index]?.medicationName?.message}
                    {...register(`prescriptions.${index}.medicationName`)}
                  />
                  <Input
                    label="Dosage"
                    placeholder="e.g. 500mg"
                    error={errors.prescriptions?.[index]?.dosage?.message}
                    {...register(`prescriptions.${index}.dosage`)}
                  />
                  <Input
                    label="Frequency"
                    placeholder="e.g. Twice daily"
                    error={errors.prescriptions?.[index]?.frequency?.message}
                    {...register(`prescriptions.${index}.frequency`)}
                  />
                  <Input
                    label="Duration (days)"
                    type="number"
                    min={1}
                    max={365}
                    error={errors.prescriptions?.[index]?.durationDays?.message}
                    {...register(`prescriptions.${index}.durationDays`)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Remove prescription"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <Input
                label="Instructions (optional)"
                error={errors.prescriptions?.[index]?.instructions?.message}
                {...register(`prescriptions.${index}.instructions`)}
              />
            </div>
          ))}
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add record
          </Button>
        </div>
      </form>
    </Modal>
  )
}
