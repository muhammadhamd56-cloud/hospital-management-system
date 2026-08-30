import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listMyInvoices } from '@/features/billing/api'
import { ApiError } from '@/lib/apiClient'
import type { Invoice } from '@/types/invoice'

export function useMyInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)

  function refresh() {
    setIsLoading(true)
    listMyInvoices()
      .then((res) => setInvoices(res.invoices))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your invoices'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  return { invoices, isLoading, refresh }
}
