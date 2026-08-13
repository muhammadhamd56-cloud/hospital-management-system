export type InvoiceStatus = 'paid' | 'pending' | 'overdue'

export interface Invoice {
  id: string
  patientId: string
  patientName: string
  description: string
  amount: number
  issueDate: string
  dueDate: string
  status: InvoiceStatus
}
