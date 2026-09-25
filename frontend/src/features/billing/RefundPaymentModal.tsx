import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/currency'
import { refundPayment } from '@/features/billing/api'
import { ApiError } from '@/lib/apiClient'
import type { Invoice, Payment } from '@/types/invoice'

const refundSchema = z.object({
  amount: z.coerce.number().positive('Enter an amount greater than 0'),
  reason: z.string().trim().max(300, 'Reason is too long'),
})

type RefundFormInput = z.input<typeof refundSchema>

interface RefundPaymentModalProps {
  invoice: Invoice | null
  payment: Payment | null
  onClose: () => void
  onRefunded: (invoice: Invoice) => void
}

export function RefundPaymentModal({ invoice, payment, onClose, onRefunded }: RefundPaymentModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RefundFormInput>({ resolver: zodResolver(refundSchema) })

  useEffect(() => {
    if (payment) {
      reset({ amount: payment.refundableAmount, reason: '' })
    }
  }, [payment, reset])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: RefundFormInput) {
    if (!invoice || !payment) return

    try {
      const parsed = refundSchema.parse(values)
      const res = await refundPayment(invoice.id, payment.id, {
        amount: parsed.amount,
        reason: parsed.reason || undefined,
      })
      toast.success(`Refund of ${formatCurrency(parsed.amount)} issued`)
      onRefunded(res.invoice)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to issue refund'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={Boolean(invoice && payment)}
      onClose={handleClose}
      title="Refund Payment"
      description={invoice && payment ? `${invoice.invoiceNumber} — ${invoice.patientName}` : undefined}
    >
      {invoice && payment && (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex items-center justify-between rounded-lg bg-surface-alt px-4 py-3 text-sm">
            <span className="text-ink-muted">Refundable balance</span>
            <span className="font-semibold text-ink">{formatCurrency(payment.refundableAmount)}</span>
          </div>
          <Input
            label="Amount (USD)"
            type="number"
            step="0.01"
            min={0}
            error={errors.amount?.message}
            {...register('amount')}
          />
          <Textarea
            label="Reason (optional)"
            rows={2}
            error={errors.reason?.message}
            {...register('reason')}
          />
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" isLoading={isSubmitting}>
              Issue Refund
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
