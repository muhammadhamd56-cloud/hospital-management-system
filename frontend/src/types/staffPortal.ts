import type { ShiftType, Staff, StaffType } from '@/types/staffScheduling'

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export interface ShiftOpening {
  id: string
  requiredStaffType: StaffType
  department: string | null
  date: string
  startTime: string
  endTime: string
  shiftType: ShiftType
  positions: number
  approvedCount: number
  applicationDeadline: string
  notes: string | null
  isOpen: boolean
  createdById: string | null
  createdAt: string
  updatedAt: string
  /** Only present on the staff-portal "available shifts" list. */
  myApplicationStatus?: ApplicationStatus | null
}

export interface ShiftApplication {
  id: string
  opening: ShiftOpening
  staff: Staff
  status: ApplicationStatus
  message: string | null
  adminNotes: string | null
  respondedById: string | null
  respondedAt: string | null
  resultingShiftId: string | null
  appliedAt: string
  updatedAt: string
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const TASK_PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({ label: TASK_PRIORITY_LABELS[value], value }))

/** "overdue" is derived server-side (dueAt in the past, not completed) --
 *  never a status the client can set directly. */
export type TaskDisplayStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export const TASK_DISPLAY_STATUS_LABELS: Record<TaskDisplayStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  overdue: 'Overdue',
}

/** The subset of statuses a nurse can move a task to themselves. */
export type SettableTaskStatus = 'pending' | 'in_progress' | 'completed'

export interface Task {
  id: string
  title: string
  description: string | null
  dueAt: string
  priority: TaskPriority
  department: string | null
  assignedTo: Staff
  assignedById: string | null
  status: TaskDisplayStatus
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AnnouncementPriority = 'normal' | 'important' | 'urgent'

export const ANNOUNCEMENT_PRIORITIES: AnnouncementPriority[] = ['normal', 'important', 'urgent']

export const ANNOUNCEMENT_PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

export interface Announcement {
  id: string
  title: string
  description: string
  priority: AnnouncementPriority
  authorName: string | null
  createdAt: string
}

export interface StaffPortalProfile {
  staffId: string
  employeeId: string
  staffType: StaffType
  fullName: string
  email: string | null
  phone: string | null
  department: string | null
  joinedAt: string
  isActive: boolean
}
