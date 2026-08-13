import { useEffect, useMemo, useState } from 'react'
import { Search, BedDouble } from 'lucide-react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
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
import { listBeds, releaseBed } from '@/features/beds/api'
import { BedStatusBadge } from '@/features/beds/BedStatusBadge'
import { AssignBedModal } from '@/features/beds/AssignBedModal'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import type { Bed, BedStatus } from '@/types/bed'

const PAGE_SIZE = 10

const STATUS_FILTER_OPTIONS: { label: string; value: BedStatus | 'all' }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Available', value: 'available' },
  { label: 'Occupied', value: 'occupied' },
  { label: 'Maintenance', value: 'maintenance' },
]

const DEPARTMENT_FILTER_OPTIONS = [
  { label: 'All departments', value: 'all' },
  ...DEPARTMENTS.map((department) => ({ label: department, value: department })),
]

export function BedsPage() {
  const [beds, setBeds] = useState<Bed[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [availableCount, setAvailableCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BedStatus | 'all'>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [assigningBed, setAssigningBed] = useState<Bed | null>(null)

  function refresh() {
    setIsLoading(true)
    listBeds()
      .then((res) => {
        setBeds(res.beds)
        setTotalCount(res.totalCount)
        setAvailableCount(res.availableCount)
      })
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load beds'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRelease(bed: Bed) {
    try {
      const res = await releaseBed(bed.id)
      setBeds((current) => current.map((b) => (b.id === bed.id ? res.bed : b)))
      setAvailableCount((count) => count + 1)
      toast.success(`${bed.label} released`)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to release bed'
      toast.error(message)
    }
  }

  function handleAssigned(updatedBed: Bed) {
    setBeds((current) => current.map((b) => (b.id === updatedBed.id ? updatedBed : b)))
    setAvailableCount((count) => count - 1)
  }

  const filteredBeds = useMemo(() => {
    const query = search.trim().toLowerCase()
    return beds.filter((bed) => {
      const matchesQuery =
        !query ||
        bed.label.toLowerCase().includes(query) ||
        (bed.patientName?.toLowerCase().includes(query) ?? false)
      const matchesStatus = statusFilter === 'all' || bed.status === statusFilter
      const matchesDepartment = departmentFilter === 'all' || bed.department === departmentFilter
      return matchesQuery && matchesStatus && matchesDepartment
    })
  }, [beds, search, statusFilter, departmentFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredBeds, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Beds</h1>
        <p className="text-sm text-ink-muted">
          {availableCount} / {totalCount} available
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search beds"
            hideLabel
            icon={Search}
            placeholder="Search by bed or patient name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <Select
            label="Filter by department"
            hideLabel
            options={DEPARTMENT_FILTER_OPTIONS}
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <Select
            label="Filter by status"
            hideLabel
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as BedStatus | 'all')}
          />
        </div>
      </div>

      {!isLoading && filteredBeds.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={BedDouble}
            title="No beds match your search"
            description="Try a different name, department, or status filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bed</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((bed) => (
                <TableRow key={bed.id}>
                  <TableCell className="font-medium text-ink">{bed.label}</TableCell>
                  <TableCell>{bed.department}</TableCell>
                  <TableCell>
                    <BedStatusBadge status={bed.status} />
                  </TableCell>
                  <TableCell>{bed.patientName ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    {bed.status === 'available' && (
                      <Button size="sm" variant="secondary" onClick={() => setAssigningBed(bed)}>
                        Assign
                      </Button>
                    )}
                    {bed.status === 'occupied' && (
                      <Button size="sm" variant="secondary" onClick={() => handleRelease(bed)}>
                        Release
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredBeds.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <AssignBedModal bed={assigningBed} onClose={() => setAssigningBed(null)} onAssigned={handleAssigned} />
    </div>
  )
}
