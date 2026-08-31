import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CreditCard, ListOrdered, Receipt, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { InvoiceStatusBadge } from '@/features/billing/InvoiceStatusBadge'
import { InvoiceDetailsModal } from '@/features/billing/InvoiceDetailsModal'
import { useMyInvoices } from '@/features/billing/useMyInvoices'
import { createInvoiceCheckout } from '@/features/billing/api'
import { formatDate } from '@/utils/datetime'
import { formatCurrency } from '@/utils/currency'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import type { Invoice } from '@/types/invoice'

export function PatientBillingPage() {
  const { invoices, isLoading, refresh } = useMyInvoices()
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const hasHandledReturn = useRef(false)

  // After returning from Stripe Checkout: the webhook (not this redirect)
  // is what actually confirms payment, so "paid=1" here means the card was
  // accepted, not that our own record is updated yet -- refresh() picks up
  // the real status once the webhook has landed, which is usually already
  // true by the time this page re-renders.
  useEffect(() => {
    if (hasHandledReturn.current) return
    const paid = searchParams.get('paid')
    if (paid === null) return
    hasHandledReturn.current = true

    if (paid === '1') {
      toast.success('Payment received — thank you!')
      refresh()
    } else {
      toast('Payment cancelled')
    }
    navigate(ROUTES.billing, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const amountDue = useMemo(() => invoices.reduce((sum, i) => sum + i.remaining, 0), [invoices])

  async function handlePay(invoice: Invoice) {
    setPayingInvoiceId(invoice.id)
    try {
      const { url } = await createInvoiceCheckout(invoice.id)
      window.location.assign(url)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to start payment'
      toast.error(message)
      setPayingInvoiceId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Billing</h1>
        <p className="text-sm text-ink-muted">Your invoices and what you owe.</p>
      </div>

      <div className="sm:max-w-xs">
        <StatCard label="Amount due" value={formatCurrency(amountDue)} icon={Wallet} />
      </div>

      {!isLoading && invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            description="Invoices for your visits will appear here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{invoice.description}</p>
                  <p className="text-xs text-ink-muted">
                    Due {formatDate(invoice.dueDate)} · {invoice.items.length} item
                    {invoice.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <div className="text-right">
                    <span className="block text-sm font-semibold text-ink">{formatCurrency(invoice.amount)}</span>
                    {invoice.amountPaid > 0 && invoice.remaining > 0 && (
                      <span className="block text-xs text-ink-muted">
                        {formatCurrency(invoice.remaining)} remaining
                      </span>
                    )}
                  </div>
                  <InvoiceStatusBadge status={invoice.status} />
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label="View invoice details"
                    onClick={() => setViewingInvoice(invoice)}
                  >
                    <ListOrdered className="size-4" aria-hidden="true" />
                  </Button>
                  {invoice.remaining > 0 && invoice.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      isLoading={payingInvoiceId === invoice.id}
                      disabled={payingInvoiceId !== null && payingInvoiceId !== invoice.id}
                      onClick={() => handlePay(invoice)}
                    >
                      <CreditCard className="size-4" aria-hidden="true" />
                      Pay now
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InvoiceDetailsModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
    </div>
  )
}
