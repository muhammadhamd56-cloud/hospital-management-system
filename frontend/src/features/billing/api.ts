import { api } from '@/lib/apiClient'
import type { Invoice } from '@/types/invoice'

export interface CreateInvoiceItemInput {
  description: string
  quantity: number
  unitPrice: number
}

export interface CreateInvoiceInput {
  patientId: string
  description: string
  items: CreateInvoiceItemInput[]
  dueDate: string
}

export function listInvoices(): Promise<{ invoices: Invoice[] }> {
  return api.get('/billing/invoices')
}

export function listMyInvoices(): Promise<{ invoices: Invoice[] }> {
  return api.get('/billing/invoices/me')
}

export function createInvoice(input: CreateInvoiceInput): Promise<{ invoice: Invoice }> {
  return api.post('/billing/invoices', input)
}

export function markInvoicePaid(id: string): Promise<{ invoice: Invoice }> {
  return api.patch(`/billing/invoices/${id}/pay`)
}

/** Starts an online payment for one of the caller's own invoices -- redirect
 *  the browser to the returned url (Stripe's hosted checkout page). */
export function createInvoiceCheckout(id: string): Promise<{ url: string }> {
  return api.post(`/billing/invoices/${id}/checkout`)
}

export function getRevenueThisMonth(): Promise<{ amount: number }> {
  return api.get('/billing/revenue')
}
