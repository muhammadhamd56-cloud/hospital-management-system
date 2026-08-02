import { useMemo, useState } from 'react'
import { Search, UserPlus, Eye } from 'lucide-react'
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
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePagination } from '@/hooks/usePagination'
import { MOCK_PATIENTS } from '@/features/patients/mockPatients'
import { PatientStatusBadge } from '@/features/patients/PatientStatusBadge'
import { AddPatientModal } from '@/features/patients/AddPatientModal'
import type { Patient, PatientStatus } from '@/types/patient'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Admitted', value: 'admitted' },
  { label: 'Discharged', value: 'discharged' },
]

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>(MOCK_PATIENTS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PatientStatus | 'all'>('all')
  const [isAddOpen, setAddOpen] = useState(false)

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase()
    return patients.filter((patient) => {
      const matchesQuery =
        !query ||
        patient.name.toLowerCase().includes(query) ||
        patient.email.toLowerCase().includes(query) ||
        patient.phone.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || patient.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [patients, search, statusFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredPatients, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Patients</h1>
          <p className="text-sm text-ink-muted">
            {filteredPatients.length} patient{filteredPatients.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          Add Patient
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search patients"
            hideLabel
            icon={Search}
            placeholder="Search by name, email, or phone"
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
            onChange={(event) => setStatusFilter(event.target.value as PatientStatus | 'all')}
          />
        </div>
      </div>

      {filteredPatients.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No patients match your search"
            description="Try a different name, email, phone, or status filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Gender / Age</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Blood Group</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={patient.name} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{patient.name}</p>
                        <p className="text-xs text-ink-muted">{patient.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">
                    {patient.gender}, {patient.age}
                  </TableCell>
                  <TableCell>{patient.phone}</TableCell>
                  <TableCell>{patient.bloodGroup}</TableCell>
                  <TableCell>{patient.lastVisit}</TableCell>
                  <TableCell>
                    <PatientStatusBadge status={patient.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => toast('Patient profile page is coming soon')}
                      aria-label={`View ${patient.name}`}
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
            totalItems={filteredPatients.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <AddPatientModal
        isOpen={isAddOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(patient) => setPatients((current) => [patient, ...current])}
      />
    </div>
  )
}
