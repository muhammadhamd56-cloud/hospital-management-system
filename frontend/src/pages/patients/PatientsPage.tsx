import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
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
import { listPatients } from '@/features/patients/api'
import { PatientProfileModal } from '@/features/patients/PatientProfileModal'
import { ApiError } from '@/lib/apiClient'
import type { PatientListItem } from '@/types/patientDirectory'

const PAGE_SIZE = 8

export function PatientsPage() {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  useEffect(() => {
    listPatients()
      .then((res) => setPatients(res.patients))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load patients'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return patients
    return patients.filter(
      (patient) =>
        patient.fullName.toLowerCase().includes(query) ||
        patient.email.toLowerCase().includes(query),
    )
  }, [patients, search])

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
        <Button onClick={() => toast('Adding patients here is coming soon')}>
          <UserPlus className="size-4" aria-hidden="true" />
          Add Patient
        </Button>
      </div>

      <div className="sm:w-72">
        <Input
          label="Search patients"
          hideLabel
          icon={Search}
          placeholder="Search by name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {!isLoading && filteredPatients.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No patients match your search"
            description="Try a different name or email."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Appointments</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={patient.fullName} src={patient.picture ?? undefined} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{patient.fullName}</p>
                        <p className="text-xs text-ink-muted">{patient.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(patient.joinedAt).toLocaleDateString()}</TableCell>
                  <TableCell>{patient.appointmentCount}</TableCell>
                  <TableCell>
                    {patient.lastVisit ? new Date(patient.lastVisit).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedPatientId(patient.id)}
                      aria-label={`View ${patient.fullName}`}
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

      <PatientProfileModal patientId={selectedPatientId} onClose={() => setSelectedPatientId(null)} />
    </div>
  )
}
