import { api } from '@/lib/apiClient'
import type { Invoice } from '@/types/invoice'

export interface CreateInvoiceInput {
  patientId: string
  description: string
  amount: number
  dueDate: string
}

export function listInvoices(): Promise<{ invoices: Invoice[] }> {
  return api.get('/billing/invoices')
}

export function createInvoice(input: CreateInvoiceInput): Promise<{ invoice: Invoice }> {
  return api.post('/billing/invoices', input)
}

export function markInvoicePaid(id: string): Promise<{ invoice: Invoice }> {
  return api.patch(`/billing/invoices/${id}/pay`)
}

export function getRevenueThisMonth(): Promise<{ amount: number }> {
  return api.get('/billing/revenue')
}
