import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search, ReceiptText, CheckCircle2, Clock, AlertTriangle, ListOrdered, Download, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { StatCard } from '@/components/ui/StatCard'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { useAuth } from '@/features/auth/useAuth'
import { usePagination } from '@/hooks/usePagination'
import { formatDate } from '@/utils/datetime'
import { formatCurrency } from '@/utils/currency'
import { cancelInvoice, getBillingOverview, listInvoices } from '@/features/billing/api'
import { InvoiceStatusBadge } from '@/features/billing/InvoiceStatusBadge'
import { CreateInvoiceModal } from '@/features/billing/CreateInvoiceModal'
import { InvoiceDetailsModal } from '@/features/billing/InvoiceDetailsModal'
import { RecordPaymentModal } from '@/features/billing/RecordPaymentModal'
import { RefundPaymentModal } from '@/features/billing/RefundPaymentModal'
import { ConsultationMarginCard } from '@/features/billing/ConsultationMarginCard'
import { ApiError } from '@/lib/apiClient'
import type { BillingOverview, Invoice, InvoiceStatus, Payment } from '@/types/invoice'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS: { label: string; value: InvoiceStatus | 'all' }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Partially Paid', value: 'partially_paid' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Partially Refunded', value: 'partially_refunded' },
]

type DateFilter = 'all' | 'today' | 'week' | 'month'

const DATE_FILTER_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
]

function matchesDateFilter(issueDate: string, filter: DateFilter): boolean {
  if (filter === 'all') return true

  const date = new Date(issueDate);
  const now = new Date()

  if (filter === 'today') {
    return date.toDateString() === now.toDateString()
  }
  if (filter === 'week') {
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 7)
    return date >= weekAgo
  }
  // month
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function exportInvoicesToCsv(invoices: Invoice[]) {
  const header = ['Invoice', 'Patient', 'Description', 'Amount', 'Paid', 'Remaining', 'Due Date', 'Status']
  const rows = invoices.map((invoice) => [
    invoice.invoiceNumber,
    invoice.patientName,
    invoice.description,
    invoice.amount.toFixed(2),
    invoice.amountPaid.toFixed(2),
    invoice.remaining.toFixed(2),
    invoice.dueDate,
    invoice.status,
  ])
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

type OverviewState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; overview: BillingOverview }

export function BillingPage() {
  const { user } = useAuth()
  // Refunds, cancellations, and hospital-wide revenue are admin-only on the
  // backend (see BillingController/ReportsController) -- a doctor sharing
  // this page must not be shown actions or data that will 403.
  const isAdmin = user?.role === 'admin'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [overviewState, setOverviewState] = useState<OverviewState>({ status: 'loading' })
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [isCreateOpen, setCreateOpen] = useState(false)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)
  const [refunding, setRefunding] = useState<{ invoice: Invoice; payment: Payment } | null>(null)
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep link from a notification (e.g. "Invoice INV-0001" -> Billing).
  // Left in the URL (not stripped like ?paid= on the patient side) so
  // refreshing the page re-opens the same invoice instead of losing it to
  // component state.
  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId')
    if (!invoiceId || isLoading) return

    const found = invoices.find((invoice) => invoice.id === invoiceId)
    if (found) {
      setViewingInvoice(found)
    } else {
      toast.error('This invoice is no longer available.')
      setSearchParams(
        (prev) => {
          prev.delete('invoiceId')
          return prev
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, invoices, isLoading])

  function handleCloseInvoiceModal() {
    setViewingInvoice(null)
    if (searchParams.has('invoiceId')) {
      setSearchParams(
        (prev) => {
          prev.delete('invoiceId')
          return prev
        },
        { replace: true },
      )
    }
  }

  function loadOverview() {
    getBillingOverview()
      .then((overview) => setOverviewState({ status: 'ready', overview }))
      .catch(() => setOverviewState({ status: 'error' }))
  }

  useEffect(() => {
    listInvoices()
      .then((res) => setInvoices(res.invoices))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load invoices'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
    loadOverview()
  }, [])

  function upsertInvoice(updated: Invoice) {
    setInvoices((current) => current.map((i) => (i.id === updated.id ? updated : i)))
    loadOverview()
  }

  async function handleCancel(invoice: Invoice) {
    setIsCancelling(true)
    try {
      const res = await cancelInvoice(invoice.id)
      upsertInvoice(res.invoice)
      toast.success(`Invoice ${invoice.invoiceNumber} cancelled`)
      setCancellingInvoice(null)
      setViewingInvoice(null)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to cancel invoice'
      toast.error(message)
    } finally {
      setIsCancelling(false)
    }
  }

  // ?filter=unpaid -- e.g. from the AI Assistant ("show my unpaid bills").
  // An additional predicate layered on top of the existing status/date/search
  // filters, since "unpaid" spans several existing InvoiceStatus values
  // rather than being one of them.
  const isUnpaidFilterActive = searchParams.get('filter') === 'unpaid'

  function clearUnpaidFilter() {
    setSearchParams(
      (prev) => {
        prev.delete('filter')
        return prev
      },
      { replace: true },
    )
  }

  const isFiltering = search.trim().length > 0 || statusFilter !== 'all' || dateFilter !== 'all' || isUnpaidFilterActive

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const matchesQuery =
        !query ||
        invoice.patientName.toLowerCase().includes(query) ||
        invoice.description.toLowerCase().includes(query) ||
        invoice.invoiceNumber.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter
      const matchesUnpaid = !isUnpaidFilterActive || (invoice.remaining > 0 && invoice.status !== 'cancelled')
      return matchesQuery && matchesStatus && matchesUnpaid && matchesDateFilter(invoice.issueDate, dateFilter)
    })
  }, [invoices, search, statusFilter, dateFilter, isUnpaidFilterActive])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredInvoices, PAGE_SIZE)

  function overviewValue(select: (overview: BillingOverview) => number, format: (value: number) => string): string {
    if (overviewState.status === 'loading') return 'Loading…'
    if (overviewState.status === 'error') return 'Unable to load'
    return format(select(overviewState.overview))
  }

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Revenue" value={overviewValue((o) => o.totalRevenue, formatCurrency)} icon={ReceiptText} />
        <StatCard label="Paid" value={overviewValue((o) => o.paidAmount, formatCurrency)} icon={CheckCircle2} />
        <StatCard label="Pending" value={overviewValue((o) => o.pendingAmount, formatCurrency)} icon={Clock} />
        <StatCard label="Overdue" value={overviewValue((o) => o.overdueAmount, formatCurrency)} icon={AlertTriangle} />
        <StatCard label="Invoices" value={overviewValue((o) => o.totalInvoices, String)} icon={ListOrdered} />
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueChart />
          </div>
          <ConsultationMarginCard />
        </div>
      )}

      {isUnpaidFilterActive && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span>Showing unpaid invoices only.</span>
          <button
            type="button"
            onClick={clearUnpaidFilter}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Show all
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
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
        <div className="sm:w-40">
          <Select
            label="Filter by date"
            hideLabel
            options={DATE_FILTER_OPTIONS}
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
          />
        </div>
        {isFiltering && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setDateFilter('all')
            }}
          >
            <X className="size-4" aria-hidden="true" />
            Clear filters
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="sm:ml-auto"
          disabled={filteredInvoices.length === 0}
          onClick={() => exportInvoicesToCsv(filteredInvoices)}
        >
          <Download className="size-4" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      {!isLoading && filteredInvoices.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title={isFiltering ? 'No invoices match your search' : 'No invoices yet'}
            description={
              isFiltering
                ? 'Try a different patient, invoice number, or filter.'
                : 'Invoices you create will show up here.'
            }
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => setViewingInvoice(invoice)}
                  >
                    <TableCell className="font-medium text-ink">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.patientName}</TableCell>
                    <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label="View invoice details"
                          onClick={(event) => {
                            event.stopPropagation()
                            setViewingInvoice(invoice)
                          }}
                        >
                          <ListOrdered className="size-4" aria-hidden="true" />
                        </Button>
                        {invoice.remaining > 0 && invoice.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPayingInvoice(invoice)
                            }}
                          >
                            Record Payment
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
        onCreate={(invoice) => {
          setInvoices((current) => [invoice, ...current])
          loadOverview()
        }}
      />

      <InvoiceDetailsModal
        invoice={viewingInvoice}
        onClose={handleCloseInvoiceModal}
        onRecordPayment={(invoice) => {
          setViewingInvoice(null)
          setPayingInvoice(invoice)
        }}
        onCancel={isAdmin ? (invoice) => setCancellingInvoice(invoice) : undefined}
        onRefund={
          isAdmin
            ? (invoice, payment) => {
                setViewingInvoice(null)
                setRefunding({ invoice, payment })
              }
            : undefined
        }
      />

      <RecordPaymentModal
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onRecorded={upsertInvoice}
      />

      <RefundPaymentModal
        invoice={refunding?.invoice ?? null}
        payment={refunding?.payment ?? null}
        onClose={() => setRefunding(null)}
        onRefunded={upsertInvoice}
      />

      <ConfirmDialog
        isOpen={Boolean(cancellingInvoice)}
        onClose={() => setCancellingInvoice(null)}
        onConfirm={() => cancellingInvoice && handleCancel(cancellingInvoice)}
        isLoading={isCancelling}
        title="Cancel this invoice?"
        description={
          cancellingInvoice
            ? `Invoice ${cancellingInvoice.invoiceNumber} for ${cancellingInvoice.patientName} will be marked cancelled. This cannot be undone.`
            : undefined
        }
        confirmLabel="Cancel invoice"
        variant="danger"
      />
    </div>
  )
}
