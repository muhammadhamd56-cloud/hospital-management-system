import { useEffect, useMemo, useState } from 'react'
import { Search, PackagePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
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
import { formatCurrency } from '@/utils/currency'
import { listMedicines } from '@/features/pharmacy/api'
import { StockStatusBadge } from '@/features/pharmacy/StockStatusBadge'
import { AddMedicineModal } from '@/features/pharmacy/AddMedicineModal'
import { AdjustStockModal } from '@/features/pharmacy/AdjustStockModal'
import { ApiError } from '@/lib/apiClient'
import { MEDICINE_CATEGORIES, getStockStatus, type Medicine, type StockStatus } from '@/types/medicine'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS = [
  { label: 'All stock levels', value: 'all' },
  { label: 'In Stock', value: 'in-stock' },
  { label: 'Low Stock', value: 'low-stock' },
  { label: 'Out of Stock', value: 'out-of-stock' },
]

const CATEGORY_FILTER_OPTIONS = [
  { label: 'All categories', value: 'all' },
  ...MEDICINE_CATEGORIES.map((category) => ({ label: category, value: category })),
]

export function PharmacyPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [isAddOpen, setAddOpen] = useState(false)
  const [adjustingMedicine, setAdjustingMedicine] = useState<Medicine | null>(null)

  function refresh() {
    setIsLoading(true)
    listMedicines()
      .then((res) => setMedicines(res.medicines))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load medicines'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAdjusted(updated: Medicine) {
    setMedicines((current) => current.map((m) => (m.id === updated.id ? updated : m)))
  }

  const filteredMedicines = useMemo(() => {
    const query = search.trim().toLowerCase()
    return medicines.filter((medicine) => {
      const matchesQuery = !query || medicine.name.toLowerCase().includes(query)
      const matchesStatus =
        statusFilter === 'all' || getStockStatus(medicine.stock) === statusFilter
      const matchesCategory = categoryFilter === 'all' || medicine.category === categoryFilter
      return matchesQuery && matchesStatus && matchesCategory
    })
  }, [medicines, search, statusFilter, categoryFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredMedicines, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pharmacy</h1>
          <p className="text-sm text-ink-muted">
            {filteredMedicines.length} medicine{filteredMedicines.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <PackagePlus className="size-4" aria-hidden="true" />
          Add Medicine
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search medicines"
            hideLabel
            icon={Search}
            placeholder="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <Select
            label="Filter by category"
            hideLabel
            options={CATEGORY_FILTER_OPTIONS}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <Select
            label="Filter by stock"
            hideLabel
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StockStatus | 'all')}
          />
        </div>
      </div>

      {!isLoading && filteredMedicines.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No medicines match your search"
            description="Try a different name, category, or stock filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((medicine) => (
                <TableRow key={medicine.id}>
                  <TableCell className="font-medium text-ink">{medicine.name}</TableCell>
                  <TableCell>{medicine.category}</TableCell>
                  <TableCell>
                    {medicine.stock} {medicine.unit}
                  </TableCell>
                  <TableCell>{formatCurrency(medicine.price)}</TableCell>
                  <TableCell>{new Date(medicine.expiryDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <StockStatusBadge stock={medicine.stock} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => setAdjustingMedicine(medicine)}>
                      Adjust stock
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredMedicines.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <AddMedicineModal
        isOpen={isAddOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(medicine) => setMedicines((current) => [medicine, ...current])}
      />

      <AdjustStockModal
        medicine={adjustingMedicine}
        onClose={() => setAdjustingMedicine(null)}
        onAdjusted={handleAdjusted}
      />
    </div>
  )
}
