import { useMemo, useState } from 'react'
import { Search, CalendarPlus } from 'lucide-react'
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
import { formatDate, formatTime } from '@/utils/datetime'
import { MOCK_APPOINTMENTS } from '@/features/appointments/mockAppointments'
import { AppointmentStatusBadge } from '@/features/appointments/AppointmentStatusBadge'
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal'
import type { Appointment, AppointmentStatus } from '@/types/appointment'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'No-show', value: 'no-show' },
]

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>(MOCK_APPOINTMENTS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  const [isBookOpen, setBookOpen] = useState(false)

  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...appointments]
      .filter((appointment) => {
        const matchesQuery =
          !query ||
          appointment.patientName.toLowerCase().includes(query) ||
          appointment.doctorName.toLowerCase().includes(query)
        const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter
        return matchesQuery && matchesStatus
      })
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
  }, [appointments, search, statusFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(
    filteredAppointments,
    PAGE_SIZE,
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Appointments</h1>
          <p className="text-sm text-ink-muted">
            {filteredAppointments.length} appointment
            {filteredAppointments.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setBookOpen(true)}>
          <CalendarPlus className="size-4" aria-hidden="true" />
          Book Appointment
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search appointments"
            hideLabel
            icon={Search}
            placeholder="Search by patient or doctor"
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
            onChange={(event) =>
              setStatusFilter(event.target.value as AppointmentStatus | 'all')
            }
          />
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={Search}
            title="No appointments match your search"
            description="Try a different patient, doctor, or status filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((appointment) => (
                <TableRow key={appointment.id}>
                  <TableCell className="font-medium text-ink">
                    {appointment.patientName}
                  </TableCell>
                  <TableCell>{appointment.doctorName}</TableCell>
                  <TableCell>{appointment.department}</TableCell>
                  <TableCell>
                    {formatDate(appointment.date)} · {formatTime(appointment.time)}
                  </TableCell>
                  <TableCell className="max-w-56 truncate" title={appointment.reason}>
                    {appointment.reason}
                  </TableCell>
                  <TableCell>
                    <AppointmentStatusBadge status={appointment.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredAppointments.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <BookAppointmentModal
        isOpen={isBookOpen}
        onClose={() => setBookOpen(false)}
        onBook={(appointment) => setAppointments((current) => [appointment, ...current])}
      />
    </div>
  )
}
