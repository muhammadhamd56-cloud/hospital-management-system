import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { InvoiceStatusBadge } from '@/features/billing/InvoiceStatusBadge'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/datetime'
import { formatPatientId } from '@/utils/patientId'
import type { Invoice } from '@/types/invoice'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  OTHER: 'Other',
}

interface InvoiceDetailsModalProps {
  invoice: Invoice | null
  onClose: () => void
  /** Omit for a read-only (patient-facing) view. */
  onRecordPayment?: (invoice: Invoice) => void
  onCancel?: (invoice: Invoice) => void
}

export function InvoiceDetailsModal({ invoice, onClose, onRecordPayment, onCancel }: InvoiceDetailsModalProps) {
  return (
    <Modal
      isOpen={Boolean(invoice)}
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'}
      description={invoice?.patientName}
      className="max-w-2xl"
    >
      {invoice && (
        <div className="flex flex-col gap-4">
          <div className="print-area flex flex-col gap-4">
            <div className="hidden items-start justify-between print:flex">
              <div>
                <p className="text-lg font-semibold">Hospital Management System</p>
                <p className="text-sm text-ink-muted">Invoice {invoice.invoiceNumber}</p>
              </div>
              <InvoiceStatusBadge status={invoice.status} />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-ink-muted">Patient</p>
                <p className="font-medium text-ink">{invoice.patientName}</p>
                <p className="text-xs text-ink-muted">{formatPatientId(invoice.patientId)}</p>
              </div>
              <div className="print:hidden">
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <div>
                <p className="text-xs text-ink-muted">Invoice Date</p>
                <p className="font-medium text-ink">{formatDate(invoice.issueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Due Date</p>
                <p className="font-medium text-ink">{formatDate(invoice.dueDate)}</p>
              </div>
            </div>

            {invoice.description && <p className="text-sm text-ink-muted">{invoice.description}</p>}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-1 rounded-lg bg-surface-alt px-4 py-3 text-sm">
              <div className="flex items-center justify-between text-ink-muted">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex items-center justify-between text-ink-muted">
                  <span>Discount</span>
                  <span>-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex items-center justify-between text-ink-muted">
                  <span>Tax</span>
                  <span>+{formatCurrency(invoice.tax)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-surface-border pt-1 font-semibold text-ink">
                <span>Total</span>
                <span>{formatCurrency(invoice.amount)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border border-surface-border px-4 py-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Payment Summary</p>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Total</span>
                <span className="font-medium text-ink">{formatCurrency(invoice.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Paid</span>
                <span className="font-medium text-ink">{formatCurrency(invoice.amountPaid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Remaining</span>
                <span className="font-medium text-ink">{formatCurrency(invoice.remaining)}</span>
              </div>
            </div>

            {invoice.payments.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Payment History</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Recorded By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.createdAt)}</TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</TableCell>
                        <TableCell>{payment.recordedBy ?? 'Online payment'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="no-print flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden="true" />
              Print Invoice
            </Button>
            {onCancel && invoice.status !== 'cancelled' && invoice.amountPaid === 0 && (
              <Button type="button" variant="danger" onClick={() => onCancel(invoice)}>
                Cancel Invoice
              </Button>
            )}
            {onRecordPayment && invoice.remaining > 0 && invoice.status !== 'cancelled' && (
              <Button type="button" onClick={() => onRecordPayment(invoice)}>
                Record Payment
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
