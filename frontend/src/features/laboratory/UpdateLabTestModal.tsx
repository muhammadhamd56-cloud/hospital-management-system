import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { updateLabTestStatus } from '@/features/laboratory/api'
import { ApiError } from '@/lib/apiClient'
import type { LabTest, LabTestStatus } from '@/types/labTest'

const schema = z.object({
  status: z.enum(['pending', 'in-progress', 'completed']),
  resultSummary: z.string().trim().optional(),
})

type FormValues = z.infer<typeof schema>

const STATUS_OPTIONS: { label: string; value: LabTestStatus }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' },
]

interface UpdateLabTestModalProps {
  test: LabTest | null
  onClose: () => void
  onUpdated: (test: LabTest) => void
}

export function UpdateLabTestModal({ test, onClose, onUpdated }: UpdateLabTestModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (test) {
      reset({ status: test.status, resultSummary: test.resultSummary ?? '' })
    }
  }, [test, reset])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: FormValues) {
    if (!test) return

    try {
      const res = await updateLabTestStatus(test.id, values.status, values.resultSummary)
      onUpdated(res.test)
      toast.success(`${test.testName} updated`)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update lab test'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={test !== null}
      onClose={handleClose}
      title="Update Lab Test"
      description={test ? `${test.testName} for ${test.patientName}` : undefined}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Status"
          error={errors.status?.message}
          {...register('status')}
          options={STATUS_OPTIONS}
        />
        <Textarea
          label="Result summary"
          placeholder="Optional -- add findings once the test is complete"
          error={errors.resultSummary?.message}
          {...register('resultSummary')}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
