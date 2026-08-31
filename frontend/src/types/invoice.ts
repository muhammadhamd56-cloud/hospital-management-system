export type InvoiceStatus = 'paid' | 'pending' | 'partially_paid' | 'overdue' | 'cancelled'

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  discount: number
  lineTotal: number
}

export interface Payment {
  id: string
  amount: number
  method: PaymentMethod
  recordedBy: string | null
  createdAt: string
}

export interface Invoice {
  id: string
  invoiceNumber: string
  patientId: string
  patientName: string
  description: string
  subtotal: number
  discount: number
  tax: number
  amount: number
  amountPaid: number
  remaining: number
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  items: InvoiceItem[]
  payments: Payment[]
}

export interface BillingOverview {
  totalRevenue: number
  paidAmount: number
  pendingAmount: number
  overdueAmount: number
  totalInvoices: number
}
