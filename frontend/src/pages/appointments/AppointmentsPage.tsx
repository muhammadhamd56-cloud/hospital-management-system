import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
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
import { formatDateTime } from '@/utils/datetime'
import { listAllAppointments, type AdminAppointment } from '@/features/appointments/api'
import { AppointmentDetailsModal } from '@/features/appointments/AppointmentDetailsModal'
import { ApiError } from '@/lib/apiClient'
import type { SessionStatus } from '@/types/patientSession'

const PAGE_SIZE = 8

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const STATUS_VARIANT: Record<SessionStatus, 'brand' | 'success' | 'neutral'> = {
  scheduled: 'brand',
  completed: 'success',
  cancelled: 'neutral',
}

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AdminAppointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all')
  const [viewingAppointment, setViewingAppointment] = useState<AdminAppointment | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    listAllAppointments()
      .then((res) => setAppointments(res.appointments))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load appointments'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Deep link from a notification (e.g. "New appointment booked" -> Appointments).
  // Left in the URL so refreshing the page re-opens the same appointment.
  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId')
    if (!appointmentId || isLoading) return

    const found = appointments.find((appointment) => appointment.id === appointmentId)
    if (found) {
      setViewingAppointment(found)
    } else {
      toast.error('This appointment is no longer available.')
      setSearchParams(
        (prev) => {
          prev.delete('appointmentId')
          return prev
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, appointments, isLoading])

  function handleCloseAppointmentModal() {
    setViewingAppointment(null)
    if (searchParams.has('appointmentId')) {
      setSearchParams(
        (prev) => {
          prev.delete('appointmentId')
          return prev
        },
        { replace: true },
      )
    }
  }

  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLowerCase()
    return appointments.filter((appointment) => {
      const matchesQuery =
        !query ||
        appointment.patientName.toLowerCase().includes(query) ||
        appointment.doctorName.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [appointments, search, statusFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredAppointments, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Appointments</h1>
        <p className="text-sm text-ink-muted">
          {filteredAppointments.length} appointment{filteredAppointments.length === 1 ? '' : 's'}
        </p>
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
            onChange={(event) => setStatusFilter(event.target.value as SessionStatus | 'all')}
          />
        </div>
      </div>

      {!isLoading && filteredAppointments.length === 0 ? (
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
                <TableRow
                  key={appointment.id}
                  className="cursor-pointer hover:bg-surface-alt"
                  onClick={() => setViewingAppointment(appointment)}
                >
                  <TableCell className="font-medium text-ink">{appointment.patientName}</TableCell>
                  <TableCell>{appointment.doctorName}</TableCell>
                  <TableCell>{appointment.department}</TableCell>
                  <TableCell>{formatDateTime(appointment.scheduledAt)}</TableCell>
                  <TableCell className="max-w-56 truncate" title={appointment.reason}>
                    {appointment.reason}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[appointment.status]}>{appointment.status}</Badge>
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

      <AppointmentDetailsModal appointment={viewingAppointment} onClose={handleCloseAppointmentModal} />
    </div>
  )
}
