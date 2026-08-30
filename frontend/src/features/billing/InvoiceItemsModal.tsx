import { Modal } from '@/components/ui/Modal'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/utils/currency'
import type { Invoice } from '@/types/invoice'

interface InvoiceItemsModalProps {
  invoice: Invoice | null
  onClose: () => void
}

export function InvoiceItemsModal({ invoice, onClose }: InvoiceItemsModalProps) {
  return (
    <Modal
      isOpen={Boolean(invoice)}
      onClose={onClose}
      title="Invoice line items"
      description={invoice ? `${invoice.id} — ${invoice.patientName}` : undefined}
    >
      {invoice && (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead className="text-right">Line total</TableHead>
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
          <div className="flex items-center justify-between rounded-lg bg-surface-alt px-4 py-3">
            <span className="text-sm font-medium text-ink-muted">Total</span>
            <span className="text-lg font-semibold text-ink">{formatCurrency(invoice.amount)}</span>
          </div>
        </div>
      )}
    </Modal>
  )
}
