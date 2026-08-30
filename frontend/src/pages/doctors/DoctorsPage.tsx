import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Search, UserPlus, Eye, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePagination } from '@/hooks/usePagination'
import { listDoctors } from '@/features/patientDashboard/api'
import { AddDoctorModal } from '@/features/doctors/AddDoctorModal'
import { DoctorProfileModal } from '@/features/doctors/DoctorProfileModal'
import type { CreateStaffResponse } from '@/features/staff/api'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

const PAGE_SIZE = 8

type AvailabilityFilter = 'all' | 'available' | 'unavailable'

const STATUS_FILTER_OPTIONS: { label: string; value: AvailabilityFilter }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Available', value: 'available' },
  { label: 'Unavailable', value: 'unavailable' },
]

const DEPARTMENT_FILTER_OPTIONS = [
  { label: 'All departments', value: 'all' },
  ...DEPARTMENTS.map((department) => ({ label: department, value: department })),
]

export function DoctorsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AvailabilityFilter>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [isAddOpen, setAddOpen] = useState(false)
  const [selectedDoctor, setSelectedDoctor] = useState<DirectoryDoctor | null>(null)
  const [revealed, setRevealed] = useState<CreateStaffResponse | null>(null)
  const [copied, setCopied] = useState(false)

  function refresh() {
    setIsLoading(true)
    listDoctors({ limit: 50 })
      .then((res) => setDoctors(res.doctors))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load doctors'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link from the navbar's global search: open a specific doctor's
  // profile as soon as the directory has loaded, then clear the nav state so
  // it doesn't reopen on a later visit via the back button.
  useEffect(() => {
    const openDoctorId = (location.state as { openDoctorId?: string } | null)?.openDoctorId
    if (openDoctorId && !isLoading) {
      const match = doctors.find((doctor) => doctor.id === openDoctorId)
      if (match) setSelectedDoctor(match)
      navigate(location.pathname, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, doctors])

  function handleCreated(result: CreateStaffResponse) {
    refresh()
    setRevealed(result)
    setCopied(false)
  }

  async function handleCopy() {
    if (!revealed) return
    await navigator.clipboard.writeText(revealed.tempPassword)
    setCopied(true)
    toast.success('Copied to clipboard')
  }

  const filteredDoctors = useMemo(() => {
    const query = search.trim().toLowerCase()
    return doctors.filter((doctor) => {
      const matchesQuery =
        !query ||
        doctor.fullName.toLowerCase().includes(query) ||
        doctor.specialization.toLowerCase().includes(query) ||
        (doctor.email?.toLowerCase().includes(query) ?? false)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'available' && doctor.isAvailable) ||
        (statusFilter === 'unavailable' && !doctor.isAvailable)
      const matchesDepartment =
        departmentFilter === 'all' || doctor.department === departmentFilter
      return matchesQuery && matchesStatus && matchesDepartment
    })
  }, [doctors, search, statusFilter, departmentFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredDoctors, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Doctors</h1>
          <p className="text-sm text-ink-muted">
            {filteredDoctors.length} doctor{filteredDoctors.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          Add Doctor
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search doctors"
            hideLabel
            icon={Search}
            placeholder="Search by name, email, or specialization"
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
            onChange={(event) => setStatusFilter(event.target.value as AvailabilityFilter)}
          />
        </div>
      </div>

      {!isLoading && filteredDoctors.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No doctors match your search"
            description="Try a different name, specialization, department, or status filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((doctor) => (
                <TableRow key={doctor.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={doctor.fullName} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{doctor.fullName}</p>
                        <p className="text-xs text-ink-muted">{doctor.email ?? 'No account'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{doctor.specialization}</TableCell>
                  <TableCell>{doctor.department}</TableCell>
                  <TableCell>{doctor.experienceYears} yrs</TableCell>
                  <TableCell>
                    <Badge variant={doctor.isAvailable ? 'success' : 'neutral'}>
                      {doctor.isAvailable ? 'Available' : 'Unavailable'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedDoctor(doctor)}
                      aria-label={`View ${doctor.fullName}`}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt hover:text-ink"
                    >
                      <Eye className="size-4" aria-hidden="true" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredDoctors.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <AddDoctorModal
        isOpen={isAddOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />

      <DoctorProfileModal doctor={selectedDoctor} onClose={() => setSelectedDoctor(null)} />

      <Modal
        isOpen={revealed !== null}
        onClose={() => setRevealed(null)}
        title="Account created"
        description={
          revealed
            ? `Relay this temporary password to ${revealed.staff.fullName} — it won't be shown again.`
            : undefined
        }
      >
        {revealed && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-alt px-4 py-3">
              <code className="text-sm font-medium text-ink">{revealed.tempPassword}</code>
              <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="size-4" aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden="true" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setRevealed(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
