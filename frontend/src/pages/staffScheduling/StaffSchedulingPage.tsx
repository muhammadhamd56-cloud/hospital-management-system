import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  Repeat,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import { usePagination } from '@/hooks/usePagination'
import { AddStaffModal } from '@/features/staffScheduling/AddStaffModal'
import { AttendanceModal } from '@/features/staffScheduling/AttendanceModal'
import { AttendancePanel } from '@/features/staffScheduling/AttendancePanel'
import { AvailabilityPanel } from '@/features/staffScheduling/AvailabilityPanel'
import { CalendarView, type CalendarMode } from '@/features/staffScheduling/CalendarView'
import { OpeningsPanel } from '@/features/staffScheduling/OpeningsPanel'
import { ApplicationsPanel } from '@/features/staffScheduling/ApplicationsPanel'
import { TasksPanel } from '@/features/staffScheduling/TasksPanel'
import { RecurringShiftModal } from '@/features/staffScheduling/RecurringShiftModal'
import { ShiftDetailModal } from '@/features/staffScheduling/ShiftDetailModal'
import { ShiftFormModal } from '@/features/staffScheduling/ShiftFormModal'
import { ShiftStatusBadge } from '@/features/staffScheduling/ShiftStatusBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { StaffTypeBadge } from '@/features/staffScheduling/StaffTypeBadge'
import { TemplatesPanel } from '@/features/staffScheduling/TemplatesPanel'
import {
  deleteShift,
  deleteStaffRosterEntry,
  listAttendance,
  listShifts,
  listStaffRoster,
  listTemplates,
  updateShift,
} from '@/features/staffScheduling/api'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import {
  SHIFT_STATUS_OPTIONS,
  STAFF_TYPE_OPTIONS,
  type Attendance,
  type Shift,
  type ShiftStatus,
  type ShiftTemplate,
  type Staff,
  type StaffType,
} from '@/types/staffScheduling'

const PAGE_SIZE = 8

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function StaffSchedulingPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())

  const [search, setSearch] = useState('')
  const [staffTypeFilter, setStaffTypeFilter] = useState<StaffType | 'all'>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | 'all'>('all')

  const [isAddStaffOpen, setAddStaffOpen] = useState(false)
  const [isShiftFormOpen, setShiftFormOpen] = useState(false)
  const [isRecurringOpen, setRecurringOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [viewingShift, setViewingShift] = useState<Shift | null>(null)
  const [attendanceShift, setAttendanceShift] = useState<Shift | null>(null)
  const [shiftToCancel, setShiftToCancel] = useState<Shift | null>(null)
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null)
  const [staffToRemove, setStaffToRemove] = useState<Staff | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    Promise.all([listStaffRoster(), listShifts(), listTemplates(), listAttendance()])
      .then(([staffRes, shiftsRes, templatesRes, attendanceRes]) => {
        setStaff(staffRes.staff)
        setShifts(shiftsRes.shifts)
        setTemplates(templatesRes.templates)
        setAttendance(attendanceRes.attendance)
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const departmentOptions = useMemo(() => {
    const names = new Set<string>(DEPARTMENTS)
    staff.forEach((member) => member.department && names.add(member.department))
    return Array.from(names).sort()
  }, [staff])

  const filteredShifts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return shifts.filter((shift) => {
      const matchesQuery =
        !query ||
        shift.staff.fullName.toLowerCase().includes(query) ||
        (shift.department ?? '').toLowerCase().includes(query)
      const matchesType = staffTypeFilter === 'all' || shift.staff.staffType === staffTypeFilter
      const matchesDept = departmentFilter === 'all' || shift.department === departmentFilter
      const matchesStatus = statusFilter === 'all' || shift.status === statusFilter
      return matchesQuery && matchesType && matchesDept && matchesStatus
    })
  }, [shifts, search, staffTypeFilter, departmentFilter, statusFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredShifts, PAGE_SIZE)

  const stats = useMemo(() => {
    const now = new Date()
    const todayShifts = shifts.filter((shift) => isSameDay(new Date(shift.startTime), now))
    const currentlyWorking = shifts.filter((shift) => {
      const start = new Date(shift.startTime).getTime()
      const end = new Date(shift.endTime).getTime()
      const t = now.getTime()
      return t >= start && t < end && shift.status !== 'cancelled' && shift.status !== 'absent'
    })
    const upcoming = shifts.filter(
      (shift) => new Date(shift.startTime).getTime() > now.getTime() && shift.status === 'scheduled',
    )
    const cancelledToday = todayShifts.filter((shift) => shift.status === 'cancelled')

    return {
      today: todayShifts.length,
      currentlyWorking: currentlyWorking.length,
      upcoming: upcoming.length,
      cancelledToday: cancelledToday.length,
    }
  }, [shifts])

  function handleStaffCreated(newStaff: Staff) {
    setStaff((current) => [...current, newStaff].sort((a, b) => a.fullName.localeCompare(b.fullName)))
    toast.success(`${newStaff.fullName} added to the roster`)
  }

  async function handleRemoveStaff() {
    if (!staffToRemove) return

    setIsMutating(true)
    try {
      await deleteStaffRosterEntry(staffToRemove.id)
      setStaff((current) => current.filter((member) => member.id !== staffToRemove.id))
      setShifts((current) => current.filter((shift) => shift.staff.id !== staffToRemove.id))
      toast.success(`${staffToRemove.fullName} removed from the roster`)
      setStaffToRemove(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to remove staff member')
    } finally {
      setIsMutating(false)
    }
  }

  function handleShiftSaved(shift: Shift) {
    setShifts((current) => {
      const exists = current.some((existing) => existing.id === shift.id)
      const next = exists ? current.map((existing) => (existing.id === shift.id ? shift : existing)) : [...current, shift]
      return next.sort((a, b) => a.startTime.localeCompare(b.startTime))
    })
    toast.success(editingShift ? 'Shift updated' : 'Shift scheduled')
    setEditingShift(null)
  }

  async function handleCancelShift() {
    if (!shiftToCancel) return

    setIsMutating(true)
    try {
      const result = await updateShift(shiftToCancel.id, { status: 'cancelled' })
      setShifts((current) => current.map((shift) => (shift.id === result.shift.id ? result.shift : shift)))
      toast.success('Shift cancelled')
      setShiftToCancel(null)
      setViewingShift(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to cancel shift')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleDeleteShift() {
    if (!shiftToDelete) return

    setIsMutating(true)
    try {
      await deleteShift(shiftToDelete.id)
      setShifts((current) => current.filter((shift) => shift.id !== shiftToDelete.id))
      toast.success('Shift deleted')
      setShiftToDelete(null)
      setViewingShift(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to delete shift')
    } finally {
      setIsMutating(false)
    }
  }

  function handleRecurringSaved(newShifts: Shift[]) {
    setShifts((current) => [...current, ...newShifts].sort((a, b) => a.startTime.localeCompare(b.startTime)))
  }

  function handleAttendanceSaved(record: Attendance) {
    setAttendance((current) => {
      const exists = current.some((existing) => existing.id === record.id)
      return exists ? current.map((existing) => (existing.id === record.id ? record : existing)) : [...current, record]
    })
    toast.success('Attendance saved')
    setAttendanceShift(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Staff Scheduling</h1>
          <p className="text-sm text-ink-muted">
            {shifts.length} shift{shifts.length === 1 ? '' : 's'} · {staff.length} on the roster
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setAddStaffOpen(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            Add staff
          </Button>
          <Button
            variant="secondary"
            onClick={() => setRecurringOpen(true)}
            disabled={staff.filter((member) => member.isActive).length === 0}
          >
            <Repeat className="size-4" aria-hidden="true" />
            Recurring shift
          </Button>
          <Button
            onClick={() => {
              setEditingShift(null)
              setShiftFormOpen(true)
            }}
            disabled={staff.filter((member) => member.isActive).length === 0}
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Schedule shift
          </Button>
        </div>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load staff schedule." description="Something went wrong loading the schedule." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Today's shifts" value={String(stats.today)} icon={CalendarClock} />
            <StatCard label="Currently working" value={String(stats.currentlyWorking)} icon={Users} />
            <StatCard label="Upcoming" value={String(stats.upcoming)} icon={CalendarPlus} />
            <StatCard label="Cancelled today" value={String(stats.cancelledToday)} icon={AlertTriangle} />
          </div>

          <Tabs defaultTab="calendar">
            <TabsList>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="shifts">Shifts</TabsTrigger>
              <TabsTrigger value="roster">Staff Roster</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="openings">Openings</TabsTrigger>
              <TabsTrigger value="applications">Applications</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar">
              {isLoading ? (
                <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
              ) : (
                <CalendarView
                  mode={calendarMode}
                  onModeChange={setCalendarMode}
                  anchorDate={anchorDate}
                  onAnchorChange={setAnchorDate}
                  shifts={filteredShifts}
                  onShiftClick={setViewingShift}
                />
              )}
            </TabsContent>

            <TabsContent value="shifts">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="sm:w-64">
                    <Input
                      label="Search shifts"
                      hideLabel
                      icon={Search}
                      placeholder="Search by staff or department"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="sm:w-48">
                    <Select
                      label="Staff type"
                      hideLabel
                      value={staffTypeFilter}
                      onChange={(event) => setStaffTypeFilter(event.target.value as StaffType | 'all')}
                      options={[{ label: 'All staff types', value: 'all' }, ...STAFF_TYPE_OPTIONS]}
                    />
                  </div>
                  <div className="sm:w-48">
                    <Select
                      label="Department"
                      hideLabel
                      value={departmentFilter}
                      onChange={(event) => setDepartmentFilter(event.target.value)}
                      options={[
                        { label: 'All departments', value: 'all' },
                        ...departmentOptions.map((dept) => ({ label: dept, value: dept })),
                      ]}
                    />
                  </div>
                  <div className="sm:w-44">
                    <Select
                      label="Status"
                      hideLabel
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as ShiftStatus | 'all')}
                      options={[{ label: 'All statuses', value: 'all' }, ...SHIFT_STATUS_OPTIONS]}
                    />
                  </div>
                </div>

                {isLoading ? (
                  <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
                ) : filteredShifts.length === 0 ? (
                  <div className="rounded-card border border-surface-border bg-surface">
                    <EmptyState icon={Search} title="No shifts scheduled." description="Try a different search or filter, or schedule a new shift." />
                  </div>
                ) : (
                  <div className="rounded-card border border-surface-border bg-surface">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Shift</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>End</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageItems.map((shift) => (
                          <TableRow key={shift.id}>
                            <TableCell className="font-medium text-ink">{shift.staff.fullName}</TableCell>
                            <TableCell>
                              <StaffTypeBadge staffType={shift.staff.staffType} />
                            </TableCell>
                            <TableCell>{shift.department ?? '—'}</TableCell>
                            <TableCell>
                              <ShiftTypeBadge shiftType={shift.shiftType} />
                            </TableCell>
                            <TableCell>{formatDateTime(shift.startTime)}</TableCell>
                            <TableCell>{formatDateTime(shift.endTime)}</TableCell>
                            <TableCell>
                              <ShiftStatusBadge status={shift.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="secondary" onClick={() => setViewingShift(shift)}>
                                View
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
                      totalItems={filteredShifts.length}
                      pageSize={PAGE_SIZE}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="roster">
              {isLoading ? (
                <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
              ) : staff.length === 0 ? (
                <div className="rounded-card border border-surface-border bg-surface">
                  <EmptyState icon={UserPlus} title="No staff on the roster yet" description="Add a staff member before scheduling shifts." />
                </div>
              ) : (
                <div className="rounded-card border border-surface-border bg-surface">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium text-ink">{member.fullName}</TableCell>
                          <TableCell>
                            <StaffTypeBadge staffType={member.staffType} />
                          </TableCell>
                          <TableCell>{member.department ?? '—'}</TableCell>
                          <TableCell>{member.isActive ? 'Active' : 'Inactive'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setStaffToRemove(member)}
                              aria-label={`Remove ${member.fullName}`}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="templates">
              <TemplatesPanel templates={templates} isLoading={isLoading} onTemplatesChange={setTemplates} />
            </TabsContent>

            <TabsContent value="availability">
              <AvailabilityPanel staff={staff} />
            </TabsContent>

            <TabsContent value="attendance">
              <AttendancePanel
                shifts={shifts}
                attendance={attendance}
                isLoading={isLoading}
                onRecord={setAttendanceShift}
              />
            </TabsContent>

            <TabsContent value="openings">
              <OpeningsPanel />
            </TabsContent>

            <TabsContent value="applications">
              <ApplicationsPanel />
            </TabsContent>

            <TabsContent value="tasks">
              <TasksPanel staff={staff} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <AddStaffModal
        isOpen={isAddStaffOpen}
        onClose={() => setAddStaffOpen(false)}
        onCreated={handleStaffCreated}
        existingRoster={staff}
      />

      <ShiftFormModal
        isOpen={isShiftFormOpen || editingShift !== null}
        onClose={() => {
          setShiftFormOpen(false)
          setEditingShift(null)
        }}
        staff={staff}
        templates={templates}
        shift={editingShift}
        onSaved={handleShiftSaved}
      />

      <RecurringShiftModal
        isOpen={isRecurringOpen}
        onClose={() => setRecurringOpen(false)}
        staff={staff}
        onSaved={handleRecurringSaved}
      />

      <ShiftDetailModal
        shift={viewingShift}
        attendance={viewingShift ? attendance.find((record) => record.shiftId === viewingShift.id) ?? null : null}
        onClose={() => setViewingShift(null)}
        onEdit={(shift) => {
          setViewingShift(null)
          setEditingShift(shift)
        }}
        onCancel={setShiftToCancel}
        onDelete={setShiftToDelete}
        onRecordAttendance={(shift) => {
          setViewingShift(null)
          setAttendanceShift(shift)
        }}
      />

      <AttendanceModal
        shift={attendanceShift}
        existing={attendanceShift ? attendance.find((record) => record.shiftId === attendanceShift.id) ?? null : null}
        onClose={() => setAttendanceShift(null)}
        onSaved={handleAttendanceSaved}
      />

      <ConfirmDialog
        isOpen={staffToRemove !== null}
        onClose={() => setStaffToRemove(null)}
        onConfirm={handleRemoveStaff}
        isLoading={isMutating}
        variant="danger"
        title="Remove staff member?"
        description={
          staffToRemove
            ? `This removes ${staffToRemove.fullName} from the roster and deletes their scheduled shifts.`
            : undefined
        }
        confirmLabel="Remove"
      />

      <ConfirmDialog
        isOpen={shiftToCancel !== null}
        onClose={() => setShiftToCancel(null)}
        onConfirm={handleCancelShift}
        isLoading={isMutating}
        variant="danger"
        title="Cancel shift?"
        description={shiftToCancel ? `This cancels ${shiftToCancel.staff.fullName}'s shift.` : undefined}
        confirmLabel="Cancel shift"
      />

      <ConfirmDialog
        isOpen={shiftToDelete !== null}
        onClose={() => setShiftToDelete(null)}
        onConfirm={handleDeleteShift}
        isLoading={isMutating}
        variant="danger"
        title="Delete shift?"
        description={
          shiftToDelete ? `This permanently deletes ${shiftToDelete.staff.fullName}'s shift.` : undefined
        }
        confirmLabel="Delete"
      />
    </div>
  )
}
