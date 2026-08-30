import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/currency'
import { createInvoice } from '@/features/billing/api'
import { listPatients } from '@/features/patients/api'
import { ApiError } from '@/lib/apiClient'
import type { Invoice } from '@/types/invoice'
import type { PatientListItem } from '@/types/patientDirectory'

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Describe this line item'),
  quantity: z.coerce.number().int().min(1, 'Min 1').max(9999),
  unitPrice: z.coerce.number().positive('Must be greater than 0'),
})

const invoiceSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  description: z.string().min(2, 'Describe the charges'),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item'),
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
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { patientId: '', description: '', dueDate: '', items: [{ description: '', quantity: 1, unitPrice: 0 }] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  // useWatch (not form.watch) so edits to a freshly-appended row are picked
  // up immediately — plain watch() can lag a render behind useFieldArray.
  const watchedItems = useWatch({ control, name: 'items' })

  const total = useMemo(() => {
    return (watchedItems ?? []).reduce((sum, item) => {
      const quantity = Number(item?.quantity) || 0
      const unitPrice = Number(item?.unitPrice) || 0
      return sum + quantity * unitPrice
    }, 0)
  }, [watchedItems])

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
      className="max-w-2xl"
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
          placeholder="e.g. August visit charges"
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Line items</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add item
            </Button>
          </div>

          {errors.items?.message ? <p className="text-sm text-danger-600">{errors.items.message}</p> : null}

          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-3 rounded-lg border border-surface-border p-3">
              <div className="grid flex-1 grid-cols-[1fr_90px_120px] gap-3">
                <Input
                  label="Description"
                  hideLabel={index > 0}
                  placeholder="e.g. Consultation"
                  error={errors.items?.[index]?.description?.message}
                  {...register(`items.${index}.description`)}
                />
                <Input
                  label="Qty"
                  hideLabel={index > 0}
                  type="number"
                  min={1}
                  error={errors.items?.[index]?.quantity?.message}
                  {...register(`items.${index}.quantity`)}
                />
                <Input
                  label="Unit price (USD)"
                  hideLabel={index > 0}
                  type="number"
                  step="0.01"
                  min={0}
                  error={errors.items?.[index]?.unitPrice?.message}
                  {...register(`items.${index}.unitPrice`)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Remove line item"
                className={index === 0 ? 'mt-6' : undefined}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface-alt px-4 py-3">
          <span className="text-sm font-medium text-ink-muted">Total</span>
          <span className="text-lg font-semibold text-ink">{formatCurrency(total)}</span>
        </div>

        <Input label="Due date" type="date" error={errors.dueDate?.message} {...register('dueDate')} />

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
