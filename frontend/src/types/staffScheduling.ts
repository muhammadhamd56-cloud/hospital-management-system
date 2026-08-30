export type StaffType = 'doctor' | 'nurse' | 'receptionist' | 'pharmacist' | 'lab_technician' | 'other'

export const STAFF_TYPES: StaffType[] = [
  'doctor',
  'nurse',
  'receptionist',
  'pharmacist',
  'lab_technician',
  'other',
]

/** Staff types that always require linking an existing User login account
 *  (never a name-only entry). Every other staff type may EITHER link an
 *  existing (STAFF-role) account OR be a name-only roster row. */
export const STAFF_TYPES_REQUIRING_USER: StaffType[] = ['doctor']

export const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist',
  lab_technician: 'Lab Technician',
  other: 'Other',
}

export const STAFF_TYPE_OPTIONS = STAFF_TYPES.map((value) => ({ label: STAFF_TYPE_LABELS[value], value }))

export type ShiftType = 'morning' | 'evening' | 'night' | 'custom'

export const SHIFT_TYPES: ShiftType[] = ['morning', 'evening', 'night', 'custom']

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  morning: 'Morning',
  evening: 'Evening',
  night: 'Night',
  custom: 'Custom',
}

export const SHIFT_TYPE_OPTIONS = SHIFT_TYPES.map((value) => ({ label: SHIFT_TYPE_LABELS[value], value }))

export type ShiftStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'absent'

export const SHIFT_STATUSES: ShiftStatus[] = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'absent',
]

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  absent: 'Absent',
}

export const SHIFT_STATUS_OPTIONS = SHIFT_STATUSES.map((value) => ({ label: SHIFT_STATUS_LABELS[value], value }))

export interface Staff {
  id: string
  staffType: StaffType
  fullName: string
  email: string | null
  isActive: boolean
  userId: string | null
  department: string | null
  createdAt: string
  updatedAt: string
}

export interface Shift {
  id: string
  staff: Staff
  department: string | null
  date: string
  startTime: string
  endTime: string
  shiftType: ShiftType
  status: ShiftStatus
  notes: string | null
  groupId: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface ShiftTemplate {
  id: string
  name: string
  shiftType: ShiftType
  startTime: string
  endTime: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export interface DayAvailability {
  dayOfWeek: DayOfWeek
  isAvailable: boolean
  availableFrom: string | null
  availableTo: string | null
}

export interface Leave {
  id: string
  staffId: string
  date: string
  reason: string | null
  createdAt: string
}

export type AttendanceStatus = 'scheduled' | 'present' | 'late' | 'absent' | 'leave'

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['scheduled', 'present', 'late', 'absent', 'leave']

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  scheduled: 'Scheduled',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'Leave',
}

export const ATTENDANCE_STATUS_OPTIONS = ATTENDANCE_STATUSES.map((value) => ({
  label: ATTENDANCE_STATUS_LABELS[value],
  value,
}))

export interface Attendance {
  id: string
  shiftId: string
  staffId: string
  status: AttendanceStatus
  checkIn: string | null
  checkOut: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}
