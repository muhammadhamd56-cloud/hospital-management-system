import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/currency'
import { createInvoice } from '@/features/billing/api'
import { PatientPicker } from '@/features/billing/PatientPicker'
import { listPatients } from '@/features/patients/api'
import { ApiError } from '@/lib/apiClient'
import type { Invoice } from '@/types/invoice'
import type { PatientListItem } from '@/types/patientDirectory'

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Describe this service'),
  quantity: z.coerce.number().int().min(1, 'Min 1').max(9999),
  unitPrice: z.coerce.number().positive('Must be greater than 0'),
  discount: z.coerce.number().min(0, 'Cannot be negative').optional(),
})

const invoiceSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  description: z.string().min(2, 'Describe the charges'),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one service'),
  discount: z.coerce.number().min(0, 'Cannot be negative').optional(),
  tax: z.coerce.number().min(0, 'Cannot be negative').optional(),
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      patientId: '',
      description: '',
      dueDate: '',
      discount: 0,
      tax: 0,
      items: [{ description: '', quantity: 1, unitPrice: 0, discount: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  // useWatch (not form.watch) so edits to a freshly-appended row are picked
  // up immediately -- plain watch() can lag a render behind useFieldArray.
  const watchedItems = useWatch({ control, name: 'items' })
  const watchedPatientId = useWatch({ control, name: 'patientId' })
  const watchedDiscount = useWatch({ control, name: 'discount' })
  const watchedTax = useWatch({ control, name: 'tax' })

  const subtotal = useMemo(() => {
    return (watchedItems ?? []).reduce((sum, item) => {
      const quantity = Number(item?.quantity) || 0
      const unitPrice = Number(item?.unitPrice) || 0
      const discount = Number(item?.discount) || 0
      return sum + Math.max(0, quantity * unitPrice - discount)
    }, 0)
  }, [watchedItems])

  const total = Math.max(0, subtotal - (Number(watchedDiscount) || 0) + (Number(watchedTax) || 0))

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
        <PatientPicker
          patients={patients}
          value={watchedPatientId ?? ''}
          onChange={(patientId) => setValue('patientId', patientId, { shouldValidate: true })}
          error={errors.patientId?.message}
        />
        <Input
          label="Invoice description"
          placeholder="e.g. Consultation and laboratory services"
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Services</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0, discount: 0 })}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add service
            </Button>
          </div>

          {errors.items?.message ? <p className="text-sm text-danger-600">{errors.items.message}</p> : null}

          {fields.map((field, index) => {
            const item = watchedItems?.[index]
            const lineTotal = Math.max(
              0,
              (Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0) - (Number(item?.discount) || 0),
            )

            return (
              <div key={field.id} className="flex flex-col gap-2 rounded-lg border border-surface-border p-3">
                <div className="flex items-start gap-3">
                  <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-[1fr_70px_100px_90px]">
                    <Input
                      label="Service / Description"
                      hideLabel={index > 0}
                      placeholder="e.g. Consultation"
                      className="col-span-2 sm:col-span-1"
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
                      label="Unit Price"
                      hideLabel={index > 0}
                      type="number"
                      step="0.01"
                      min={0}
                      error={errors.items?.[index]?.unitPrice?.message}
                      {...register(`items.${index}.unitPrice`)}
                    />
                    <Input
                      label="Discount"
                      hideLabel={index > 0}
                      type="number"
                      step="0.01"
                      min={0}
                      error={errors.items?.[index]?.discount?.message}
                      {...register(`items.${index}.discount`)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Remove service"
                    className={index === 0 ? 'mt-6' : undefined}
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-right text-xs text-ink-muted">Line total: {formatCurrency(lineTotal)}</p>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Invoice discount (USD)"
            type="number"
            step="0.01"
            min={0}
            error={errors.discount?.message}
            {...register('discount')}
          />
          <Input
            label="Tax (USD)"
            type="number"
            step="0.01"
            min={0}
            error={errors.tax?.message}
            {...register('tax')}
          />
        </div>

        <div className="flex flex-col gap-1 rounded-lg bg-surface-alt px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-ink-muted">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {Number(watchedDiscount) > 0 && (
            <div className="flex items-center justify-between text-ink-muted">
              <span>Discount</span>
              <span>-{formatCurrency(Number(watchedDiscount))}</span>
            </div>
          )}
          {Number(watchedTax) > 0 && (
            <div className="flex items-center justify-between text-ink-muted">
              <span>Tax</span>
              <span>+{formatCurrency(Number(watchedTax))}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-surface-border pt-1 font-semibold text-ink">
            <span>Total</span>
            <span className="text-lg">{formatCurrency(total)}</span>
          </div>
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
