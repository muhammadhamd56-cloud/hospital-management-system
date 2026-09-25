import { describe, expect, it } from 'vitest'
import { generateInvoicePdf } from '@/features/billing/generateInvoicePdf'
import type { Invoice } from '@/types/invoice'

const invoice: Invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-0001',
  patientId: 'patient-1',
  patientName: 'Ada Lovelace',
  description: 'August visit',
  subtotal: 175,
  discount: 5,
  tax: 10,
  amount: 180,
  amountPaid: 60,
  remaining: 120,
  issueDate: '2026-08-01',
  dueDate: '2026-08-15',
  status: 'partially_refunded',
  items: [
    { id: 'item-1', description: 'Consultation', quantity: 1, unitPrice: 150, discount: 0, lineTotal: 150 },
    { id: 'item-2', description: 'Blood panel', quantity: 1, unitPrice: 25, discount: 0, lineTotal: 25 },
  ],
  payments: [
    {
      id: 'payment-1',
      amount: 120,
      method: 'CARD',
      recordedBy: null,
      createdAt: '2026-08-05T00:00:00.000Z',
      refundedAmount: 60,
      refundableAmount: 60,
    },
  ],
}

describe('generateInvoicePdf', () => {
  it('builds a PDF for an invoice with line items, refunds, and payment history without throwing', async () => {
    await expect(generateInvoicePdf(invoice)).resolves.not.toThrow()
  })

  it('builds a PDF for an invoice with no payments yet without throwing', async () => {
    await expect(generateInvoicePdf({ ...invoice, payments: [], amountPaid: 0, remaining: 180 })).resolves.not.toThrow()
  })
})
