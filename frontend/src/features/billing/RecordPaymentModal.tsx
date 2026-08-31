import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/currency'
import { recordPayment } from '@/features/billing/api'
import { ApiError } from '@/lib/apiClient'
import type { Invoice, PaymentMethod } from '@/types/invoice'

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter an amount greater than 0'),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']),
})

type PaymentFormInput = z.input<typeof paymentSchema>

const METHOD_OPTIONS: { label: string; value: PaymentMethod }[] = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Card', value: 'CARD' },
  { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
  { label: 'Other', value: 'OTHER' },
]

interface RecordPaymentModalProps {
  invoice: Invoice | null
  onClose: () => void
  onRecorded: (invoice: Invoice) => void
}

export function RecordPaymentModal({ invoice, onClose, onRecorded }: RecordPaymentModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'CASH' },
  })

  useEffect(() => {
    if (invoice) {
      reset({ amount: invoice.remaining, method: 'CASH' })
    }
  }, [invoice, reset])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: PaymentFormInput) {
    if (!invoice) return

    try {
      const parsed = paymentSchema.parse(values)
      const res = await recordPayment(invoice.id, parsed)
      toast.success(`Payment of ${formatCurrency(parsed.amount)} recorded`)
      onRecorded(res.invoice)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to record payment'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={Boolean(invoice)}
      onClose={handleClose}
      title="Record Payment"
      description={invoice ? `${invoice.invoiceNumber} — ${invoice.patientName}` : undefined}
    >
      {invoice && (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex items-center justify-between rounded-lg bg-surface-alt px-4 py-3 text-sm">
            <span className="text-ink-muted">Remaining balance</span>
            <span className="font-semibold text-ink">{formatCurrency(invoice.remaining)}</span>
          </div>
          <Input
            label="Amount (USD)"
            type="number"
            step="0.01"
            min={0}
            error={errors.amount?.message}
            {...register('amount')}
          />
          <Select
            label="Payment method"
            options={METHOD_OPTIONS}
            error={errors.method?.message}
            {...register('method')}
          />
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Record Payment
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
