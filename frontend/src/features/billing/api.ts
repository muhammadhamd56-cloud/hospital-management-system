import { api } from '@/lib/apiClient'
import type { BillingOverview, Invoice, PaymentMethod } from '@/types/invoice'

export interface CreateInvoiceItemInput {
  description: string
  quantity: number
  unitPrice: number
  discount?: number
}

export interface CreateInvoiceInput {
  patientId: string
  description: string
  items: CreateInvoiceItemInput[]
  discount?: number
  tax?: number
  dueDate: string
}

export function listInvoices(): Promise<{ invoices: Invoice[] }> {
  return api.get('/billing/invoices')
}

export function listMyInvoices(): Promise<{ invoices: Invoice[] }> {
  return api.get('/billing/invoices/me')
}

export function getInvoice(id: string): Promise<{ invoice: Invoice }> {
  return api.get(`/billing/invoices/${id}`)
}

export function getBillingOverview(): Promise<BillingOverview> {
  return api.get('/billing/overview')
}

export function createInvoice(input: CreateInvoiceInput): Promise<{ invoice: Invoice }> {
  return api.post('/billing/invoices', input)
}

export function recordPayment(
  id: string,
  input: { amount: number; method: PaymentMethod },
): Promise<{ invoice: Invoice }> {
  return api.post(`/billing/invoices/${id}/payments`, input)
}

export function cancelInvoice(id: string): Promise<{ invoice: Invoice }> {
  return api.patch(`/billing/invoices/${id}/cancel`)
}

/** Starts an online payment for one of the caller's own invoices -- redirect
 *  the browser to the returned url (Stripe's hosted checkout page). */
export function createInvoiceCheckout(id: string): Promise<{ url: string }> {
  return api.post(`/billing/invoices/${id}/checkout`)
}

export function getRevenueThisMonth(): Promise<{ amount: number }> {
  return api.get('/billing/revenue')
}
