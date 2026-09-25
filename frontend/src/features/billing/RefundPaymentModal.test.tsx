import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { RefundPaymentModal } from '@/features/billing/RefundPaymentModal'
import { ApiError } from '@/lib/apiClient'
import type { Invoice, Payment } from '@/types/invoice'

const mockRefundPayment = vi.fn()

vi.mock('@/features/billing/api', () => ({
  refundPayment: (...args: unknown[]) => mockRefundPayment(...args),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const payment: Payment = {
  id: 'payment-1',
  amount: 150,
  method: 'CARD',
  recordedBy: null,
  createdAt: '2026-08-05T00:00:00.000Z',
  refundedAmount: 0,
  refundableAmount: 150,
}

const invoice: Invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-0001',
  patientId: 'patient-1',
  patientName: 'Ada Lovelace',
  description: 'August visit',
  subtotal: 150,
  discount: 0,
  tax: 0,
  amount: 150,
  amountPaid: 150,
  remaining: 0,
  issueDate: '2026-08-01',
  dueDate: '2026-08-15',
  status: 'paid',
  items: [{ id: 'item-1', description: 'Consultation', quantity: 1, unitPrice: 150, discount: 0, lineTotal: 150 }],
  payments: [payment],
}

beforeEach(() => {
  mockRefundPayment.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('RefundPaymentModal', () => {
  it('defaults the amount field to the refundable balance', async () => {
    render(<RefundPaymentModal invoice={invoice} payment={payment} onClose={vi.fn()} onRefunded={vi.fn()} />)

    expect(await screen.findByLabelText('Amount (USD)')).toHaveValue(150)
  })

  it('submits the refund and calls onRefunded with the updated invoice', async () => {
    const onRefunded = vi.fn()
    const updatedInvoice = { ...invoice, status: 'refunded' as const, amountPaid: 0, remaining: 150 }
    mockRefundPayment.mockResolvedValue({ invoice: updatedInvoice })
    const user = userEvent.setup()

    render(<RefundPaymentModal invoice={invoice} payment={payment} onClose={vi.fn()} onRefunded={onRefunded} />)

    await user.type(await screen.findByLabelText('Reason (optional)'), 'Duplicate charge')
    await user.click(screen.getByRole('button', { name: 'Issue Refund' }))

    await waitFor(() =>
      expect(mockRefundPayment).toHaveBeenCalledWith('invoice-1', 'payment-1', {
        amount: 150,
        reason: 'Duplicate charge',
      }),
    )
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('150.00'))
    expect(onRefunded).toHaveBeenCalledWith(updatedInvoice)
  })

  it('shows a friendly error and keeps the modal open when the refund fails', async () => {
    mockRefundPayment.mockRejectedValue(new ApiError('Refund exceeds refundable balance', { status: 400 }))
    const onRefunded = vi.fn()
    const user = userEvent.setup()

    render(<RefundPaymentModal invoice={invoice} payment={payment} onClose={vi.fn()} onRefunded={onRefunded} />)

    await user.click(await screen.findByRole('button', { name: 'Issue Refund' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Refund exceeds refundable balance'))
    expect(onRefunded).not.toHaveBeenCalled()
  })
})
