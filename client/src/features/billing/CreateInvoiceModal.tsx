import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { MOCK_PATIENTS } from '@/features/patients/mockPatients'
import type { Invoice } from '@/types/invoice'

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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput>({ resolver: zodResolver(invoiceSchema) })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: InvoiceFormInput) {
    const parsed = invoiceSchema.parse(values)
    const patient = MOCK_PATIENTS.find((p) => p.id === parsed.patientId)
    if (!patient) return

    await new Promise((resolve) => setTimeout(resolve, 400))
    onCreate({
      id: `INV-${crypto.randomUUID().slice(0, 8)}`,
      patientId: patient.id,
      patientName: patient.name,
      description: parsed.description,
      amount: parsed.amount,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: parsed.dueDate,
      status: 'pending',
    })
    toast.success(`Invoice created for ${patient.name}`)
    handleClose()
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
            ...MOCK_PATIENTS.map((patient) => ({ label: patient.name, value: patient.id })),
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
