import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createTemplate, updateTemplate } from '@/features/staffScheduling/api'
import { ApiError } from '@/lib/apiClient'
import { SHIFT_TYPE_OPTIONS, type ShiftTemplate } from '@/types/staffScheduling'

const schema = z.object({
  name: z.string().min(1, 'Template name is required'),
  shiftType: z.enum(['morning', 'evening', 'night', 'custom']),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface TemplateFormModalProps {
  isOpen: boolean
  onClose: () => void
  template?: ShiftTemplate | null
  onSaved: (template: ShiftTemplate) => void
}

export function TemplateFormModal({ isOpen, onClose, template, onSaved }: TemplateFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!isOpen) return

    reset(
      template
        ? {
            name: template.name,
            shiftType: template.shiftType,
            startTime: template.startTime,
            endTime: template.endTime,
            description: template.description ?? '',
          }
        : { name: '', shiftType: 'morning', startTime: '08:00', endTime: '16:00', description: '' },
    )
  }, [isOpen, template, reset])

  async function onSubmit(values: FormValues) {
    try {
      const result = template
        ? await updateTemplate(template.id, { ...values, description: values.description || undefined })
        : await createTemplate({ ...values, description: values.description || undefined })
      onSaved(result.template)
      onClose()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save template')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? 'Edit template' : 'Create template'}
      description="Reusable start/end times an admin can apply when scheduling a shift."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Template name" placeholder="Morning Shift" error={errors.name?.message} {...register('name')} />
        <Select label="Shift type" {...register('shiftType')} options={SHIFT_TYPE_OPTIONS} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start time" type="time" error={errors.startTime?.message} {...register('startTime')} />
          <Input label="End time" type="time" error={errors.endTime?.message} {...register('endTime')} />
        </div>
        <Textarea label="Description (optional)" {...register('description')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {template ? 'Save changes' : 'Create template'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
