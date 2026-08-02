import { useMemo, useState } from 'react'
import { Search, FlaskConical } from 'lucide-react'
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
import { formatDate } from '@/utils/datetime'
import { MOCK_LAB_TESTS } from '@/features/laboratory/mockLabTests'
import { LabTestStatusBadge } from '@/features/laboratory/LabTestStatusBadge'
import { RequestLabTestModal } from '@/features/laboratory/RequestLabTestModal'
import { LAB_TEST_CATEGORIES, type LabTest, type LabTestStatus } from '@/types/labTest'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' },
]

const CATEGORY_FILTER_OPTIONS = [
  { label: 'All categories', value: 'all' },
  ...LAB_TEST_CATEGORIES.map((category) => ({ label: category, value: category })),
]

export function LaboratoryPage() {
  const [labTests, setLabTests] = useState<LabTest[]>(MOCK_LAB_TESTS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LabTestStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [isRequestOpen, setRequestOpen] = useState(false)

  const filteredTests = useMemo(() => {
    const query = search.trim().toLowerCase()
    return labTests.filter((test) => {
      const matchesQuery =
        !query ||
        test.patientName.toLowerCase().includes(query) ||
        test.testName.toLowerCase().includes(query) ||
        test.doctorName.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || test.status === statusFilter
      const matchesCategory = categoryFilter === 'all' || test.category === categoryFilter
      return matchesQuery && matchesStatus && matchesCategory
    })
  }, [labTests, search, statusFilter, categoryFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredTests, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Laboratory</h1>
          <p className="text-sm text-ink-muted">
            {filteredTests.length} test{filteredTests.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setRequestOpen(true)}>
          <FlaskConical className="size-4" aria-hidden="true" />
          Request Test
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search lab tests"
            hideLabel
            icon={Search}
            placeholder="Search by patient, test, or doctor"
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
            label="Filter by status"
            hideLabel
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as LabTestStatus | 'all')}
          />
        </div>
      </div>

      {filteredTests.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No lab tests match your search"
            description="Try a different patient, test name, category, or status filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Referring Doctor</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((test) => (
                <TableRow key={test.id}>
                  <TableCell className="font-medium text-ink">{test.patientName}</TableCell>
                  <TableCell>{test.testName}</TableCell>
                  <TableCell>{test.category}</TableCell>
                  <TableCell>{test.doctorName}</TableCell>
                  <TableCell>{formatDate(test.requestedDate)}</TableCell>
                  <TableCell>
                    <LabTestStatusBadge status={test.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredTests.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <RequestLabTestModal
        isOpen={isRequestOpen}
        onClose={() => setRequestOpen(false)}
        onRequest={(labTest) => setLabTests((current) => [labTest, ...current])}
      />
    </div>
  )
}
