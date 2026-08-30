import { api } from '@/lib/apiClient'
import type {
  Attendance,
  AttendanceStatus,
  DayAvailability,
  Leave,
  Shift,
  ShiftStatus,
  ShiftTemplate,
  ShiftType,
  Staff,
  StaffType,
} from '@/types/staffScheduling'
import type {
  ApplicationStatus,
  ShiftOpening,
  ShiftApplication,
  Task,
  TaskPriority,
  TaskDisplayStatus,
} from '@/types/staffPortal'

export interface StaffListResponse {
  staff: Staff[]
}

export interface ShiftListResponse {
  shifts: Shift[]
}

export interface CreateStaffInput {
  staffType: StaffType
  /** Required when staffType already has a login account (doctor, lab_technician). */
  userId?: string
  /** Required when staffType has no login account -- name-only roster entry. */
  fullName?: string
  email?: string
  department?: string
}

export interface UpdateStaffInput {
  fullName?: string
  email?: string
  department?: string
  isActive?: boolean
}

export interface StaffFilters {
  staffType?: StaffType
  department?: string
}

export function listStaffRoster(filters: StaffFilters = {}): Promise<StaffListResponse> {
  const params = new URLSearchParams()
  if (filters.staffType) params.set('staffType', filters.staffType)
  if (filters.department) params.set('department', filters.department)
  const query = params.toString()
  return api.get(`/staff-scheduling/staff${query ? `?${query}` : ''}`)
}

export function createStaffRosterEntry(input: CreateStaffInput): Promise<{ staff: Staff }> {
  return api.post('/staff-scheduling/staff', input)
}

export function updateStaffRosterEntry(id: string, input: UpdateStaffInput): Promise<{ staff: Staff }> {
  return api.patch(`/staff-scheduling/staff/${id}`, input)
}

export function deleteStaffRosterEntry(id: string): Promise<void> {
  return api.del(`/staff-scheduling/staff/${id}`)
}

export interface ShiftInput {
  staffId: string
  department?: string
  startTime: string
  endTime: string
  /** The admin's local calendar date and local start time, sent alongside
   *  the resolved startTime/endTime instants above -- the backend uses
   *  these (not a UTC-derived guess) for day-of-week/leave/availability
   *  checks, since only the browser knows the admin's timezone. */
  date: string
  localStartTime: string
  shiftType: ShiftType
  notes?: string
  groupId?: string
}

export interface UpdateShiftInput {
  staffId?: string
  department?: string
  startTime?: string
  endTime?: string
  date?: string
  localStartTime?: string
  shiftType?: ShiftType
  status?: ShiftStatus
  notes?: string
}

export interface ShiftFilters {
  staffId?: string
  department?: string
  status?: ShiftStatus
  dateFrom?: string
  dateTo?: string
}

export function listShifts(filters: ShiftFilters = {}): Promise<ShiftListResponse> {
  const params = new URLSearchParams()
  if (filters.staffId) params.set('staffId', filters.staffId)
  if (filters.department) params.set('department', filters.department)
  if (filters.status) params.set('status', filters.status)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  const query = params.toString()
  return api.get(`/staff-scheduling/shifts${query ? `?${query}` : ''}`)
}

export function createShift(input: ShiftInput): Promise<{ shift: Shift }> {
  return api.post('/staff-scheduling/shifts', input)
}

export function updateShift(id: string, input: UpdateShiftInput): Promise<{ shift: Shift }> {
  return api.patch(`/staff-scheduling/shifts/${id}`, input)
}

export function deleteShift(id: string): Promise<void> {
  return api.del(`/staff-scheduling/shifts/${id}`)
}

export interface RecurringShiftInput {
  staffId: string
  department?: string
  shiftType: ShiftType
  /** Already-resolved ISO instants -- computed client-side from the admin's
   *  local dates/times, the same conversion used for a one-off shift, so
   *  the backend never has to guess which local weekday a wall-clock time
   *  falls on, or whether it's inside an availability window. */
  occurrences: { startTime: string; endTime: string; date: string; localStartTime: string }[]
  notes?: string
}

export function createRecurringShifts(input: RecurringShiftInput): Promise<{ shifts: Shift[] }> {
  return api.post('/staff-scheduling/shifts/recurring', input)
}

export interface TemplateListResponse {
  templates: ShiftTemplate[]
}

export interface TemplateInput {
  name: string
  shiftType: ShiftType
  startTime: string
  endTime: string
  description?: string
}

export function listTemplates(): Promise<TemplateListResponse> {
  return api.get('/staff-scheduling/templates')
}

export function createTemplate(input: TemplateInput): Promise<{ template: ShiftTemplate }> {
  return api.post('/staff-scheduling/templates', input)
}

export function updateTemplate(id: string, input: Partial<TemplateInput>): Promise<{ template: ShiftTemplate }> {
  return api.patch(`/staff-scheduling/templates/${id}`, input)
}

export function deleteTemplate(id: string): Promise<void> {
  return api.del(`/staff-scheduling/templates/${id}`)
}

export function getAvailability(staffId: string): Promise<{ availability: DayAvailability[] }> {
  return api.get(`/staff-scheduling/availability/${staffId}`)
}

export function saveAvailability(
  staffId: string,
  days: DayAvailability[],
): Promise<{ availability: DayAvailability[] }> {
  return api.put(`/staff-scheduling/availability/${staffId}`, { days })
}

export function listLeave(staffId: string): Promise<{ leave: Leave[] }> {
  return api.get(`/staff-scheduling/leave/${staffId}`)
}

export function createLeave(staffId: string, input: { date: string; reason?: string }): Promise<{ leave: Leave }> {
  return api.post(`/staff-scheduling/leave/${staffId}`, input)
}

export function deleteLeave(staffId: string, id: string): Promise<void> {
  return api.del(`/staff-scheduling/leave/${staffId}/${id}`)
}

export interface AttendanceFilters {
  staffId?: string
  dateFrom?: string
  dateTo?: string
}

export function listAttendance(filters: AttendanceFilters = {}): Promise<{ attendance: Attendance[] }> {
  const params = new URLSearchParams()
  if (filters.staffId) params.set('staffId', filters.staffId)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  const query = params.toString()
  return api.get(`/staff-scheduling/attendance${query ? `?${query}` : ''}`)
}

export interface CreateAttendanceInput {
  shiftId: string
  status: AttendanceStatus
  checkIn?: string
  checkOut?: string
  notes?: string
}

export function createAttendance(input: CreateAttendanceInput): Promise<{ attendance: Attendance }> {
  return api.post('/staff-scheduling/attendance', input)
}

export function updateAttendance(
  id: string,
  input: Partial<Omit<CreateAttendanceInput, 'shiftId'>>,
): Promise<{ attendance: Attendance }> {
  return api.patch(`/staff-scheduling/attendance/${id}`, input)
}

export interface ShiftOpeningInput {
  requiredStaffType: StaffType
  department?: string
  date: string
  startTime: string
  endTime: string
  shiftType: ShiftType
  positions: number
  applicationDeadline: string
  notes?: string
}

export interface UpdateShiftOpeningInput {
  positions?: number
  applicationDeadline?: string
  notes?: string
  isOpen?: boolean
}

export interface ShiftOpeningFilters {
  isOpen?: boolean
  requiredStaffType?: StaffType
  department?: string
}

export function listShiftOpenings(filters: ShiftOpeningFilters = {}): Promise<{ openings: ShiftOpening[] }> {
  const params = new URLSearchParams()
  if (filters.isOpen !== undefined) params.set('isOpen', String(filters.isOpen))
  if (filters.requiredStaffType) params.set('requiredStaffType', filters.requiredStaffType)
  if (filters.department) params.set('department', filters.department)
  const query = params.toString()
  return api.get(`/staff-scheduling/shift-openings${query ? `?${query}` : ''}`)
}

export function createShiftOpening(input: ShiftOpeningInput): Promise<{ opening: ShiftOpening }> {
  return api.post('/staff-scheduling/shift-openings', input)
}

export function updateShiftOpening(id: string, input: UpdateShiftOpeningInput): Promise<{ opening: ShiftOpening }> {
  return api.patch(`/staff-scheduling/shift-openings/${id}`, input)
}

export function deleteShiftOpening(id: string): Promise<void> {
  return api.del(`/staff-scheduling/shift-openings/${id}`)
}

export interface ShiftApplicationFilters {
  openingId?: string
  staffId?: string
  status?: ApplicationStatus
}

export function listShiftApplications(
  filters: ShiftApplicationFilters = {},
): Promise<{ applications: ShiftApplication[] }> {
  const params = new URLSearchParams()
  if (filters.openingId) params.set('openingId', filters.openingId)
  if (filters.staffId) params.set('staffId', filters.staffId)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  return api.get(`/staff-scheduling/shift-applications${query ? `?${query}` : ''}`)
}

export function respondToShiftApplication(
  id: string,
  input: { decision: 'approve' | 'reject'; adminNotes?: string },
): Promise<{ application: ShiftApplication }> {
  return api.patch(`/staff-scheduling/shift-applications/${id}`, input)
}

export interface TaskInput {
  title: string
  description?: string
  dueAt: string
  priority?: TaskPriority
  department?: string
  assignedToId: string
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  dueAt?: string
  priority?: TaskPriority
  department?: string
  assignedToId?: string
}

export interface TaskFilters {
  assignedToId?: string
  department?: string
  status?: TaskDisplayStatus
}

export function listTasks(filters: TaskFilters = {}): Promise<{ tasks: Task[] }> {
  const params = new URLSearchParams()
  if (filters.assignedToId) params.set('assignedToId', filters.assignedToId)
  if (filters.department) params.set('department', filters.department)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  return api.get(`/staff-scheduling/tasks${query ? `?${query}` : ''}`)
}

export function createTask(input: TaskInput): Promise<{ task: Task }> {
  return api.post('/staff-scheduling/tasks', input)
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<{ task: Task }> {
  return api.patch(`/staff-scheduling/tasks/${id}`, input)
}
