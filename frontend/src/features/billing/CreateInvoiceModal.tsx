import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { createInvoice } from '@/features/billing/api'
import { listPatients } from '@/features/patients/api'
import { ApiError } from '@/lib/apiClient'
import type { Invoice } from '@/types/invoice'
import type { PatientListItem } from '@/types/patientDirectory'

const invoiceSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  description: z.string().min(2, 'Describe the charges'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  dueDate: z.string().min(1, 'Select a due date'),
})

type InvoiceFormInput = z.input<typeof invoiceSchema>

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (invoice: Invoice) => void
}

export function CreateInvoiceModal({ isOpen, onClose, onCreate }: CreateInvoiceModalProps) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput>({ resolver: zodResolver(invoiceSchema) })

  useEffect(() => {
    if (!isOpen) return
    listPatients()
      .then((res) => setPatients(res.patients))
      .catch(() => setPatients([]))
  }, [isOpen])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: InvoiceFormInput) {
    const parsed = invoiceSchema.parse(values)

    try {
      const res = await createInvoice(parsed)
      const patient = patients.find((p) => p.id === parsed.patientId)
      toast.success(`Invoice created for ${patient?.fullName ?? 'patient'}`)
      onCreate(res.invoice)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create invoice'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Invoice"
      description="Bill a patient for services rendered."
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
        <Input
          label="Description"
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount (USD)"
            type="number"
            step="0.01"
            error={errors.amount?.message}
            {...register('amount')}
          />
          <Input
            label="Due date"
            type="date"
            error={errors.dueDate?.message}
            {...register('dueDate')}
          />
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create invoice
          </Button>
        </div>
      </form>
    </Modal>
  )
}
