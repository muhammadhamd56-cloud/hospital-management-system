export type InvoiceStatus = 'paid' | 'pending' | 'overdue'

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Invoice {
  id: string
  patientId: string
  patientName: string
  description: string
  amount: number
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  items: InvoiceItem[]
}
