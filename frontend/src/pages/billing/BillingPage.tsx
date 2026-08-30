import { useEffect, useMemo, useState } from 'react'
import { Search, ReceiptText, CheckCircle2, Clock, AlertTriangle, ListOrdered } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { StatCard } from '@/components/ui/StatCard'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePagination } from '@/hooks/usePagination'
import { formatDate } from '@/utils/datetime'
import { formatCurrency } from '@/utils/currency'
import { listInvoices, markInvoicePaid } from '@/features/billing/api'
import { InvoiceStatusBadge } from '@/features/billing/InvoiceStatusBadge'
import { CreateInvoiceModal } from '@/features/billing/CreateInvoiceModal'
import { InvoiceItemsModal } from '@/features/billing/InvoiceItemsModal'
import { ApiError } from '@/lib/apiClient'
import type { Invoice, InvoiceStatus } from '@/types/invoice'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
]

function sumByStatus(invoices: Invoice[], status: InvoiceStatus): number {
  return invoices.filter((invoice) => invoice.status === status).reduce((sum, i) => sum + i.amount, 0)
}

export function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [isCreateOpen, setCreateOpen] = useState(false)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    listInvoices()
      .then((res) => setInvoices(res.invoices))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load invoices'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function handleMarkPaid(invoice: Invoice) {
    try {
      const res = await markInvoicePaid(invoice.id)
      setInvoices((current) => current.map((i) => (i.id === invoice.id ? res.invoice : i)))
      toast.success(`${invoice.id} marked as paid`)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update invoice'
      toast.error(message)
    }
  }

  const stats = useMemo(
    () => ({
      paid: sumByStatus(invoices, 'paid'),
      pending: sumByStatus(invoices, 'pending'),
      overdue: sumByStatus(invoices, 'overdue'),
    }),
    [invoices],
  )

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const matchesQuery =
        !query ||
        invoice.patientName.toLowerCase().includes(query) ||
        invoice.description.toLowerCase().includes(query) ||
        invoice.id.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [invoices, search, statusFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredInvoices, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Billing</h1>
          <p className="text-sm text-ink-muted">
            {filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <ReceiptText className="size-4" aria-hidden="true" />
          Create Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid" value={formatCurrency(stats.paid)} icon={CheckCircle2} />
        <StatCard label="Pending" value={formatCurrency(stats.pending)} icon={Clock} />
        <StatCard label="Overdue" value={formatCurrency(stats.overdue)} icon={AlertTriangle} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search invoices"
            hideLabel
            icon={Search}
            placeholder="Search by patient, invoice #, or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <Select
            label="Filter by status"
            hideLabel
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as InvoiceStatus | 'all')}
          />
        </div>
      </div>

      {!isLoading && filteredInvoices.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No invoices match your search"
            description="Try a different patient, invoice number, or status filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium text-ink">{invoice.id}</TableCell>
                  <TableCell>{invoice.patientName}</TableCell>
                  <TableCell className="max-w-56 truncate" title={invoice.description}>
                    {invoice.description}
                    <span className="ml-1 text-xs text-ink-muted">
                      ({invoice.items.length} item{invoice.items.length === 1 ? '' : 's'})
                    </span>
                  </TableCell>
                  <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label="View line items"
                        onClick={() => setViewingInvoice(invoice)}
                      >
                        <ListOrdered className="size-4" aria-hidden="true" />
                      </Button>
                      {invoice.status !== 'paid' && (
                        <Button size="sm" variant="secondary" onClick={() => handleMarkPaid(invoice)}>
                          Mark as paid
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredInvoices.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(invoice) => setInvoices((current) => [invoice, ...current])}
      />

      <InvoiceItemsModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
    </div>
  )
}
