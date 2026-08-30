import { api } from '@/lib/apiClient'
import type { Shift, ShiftStatus } from '@/types/staffScheduling'
import type { SettableTaskStatus, ShiftApplication, ShiftOpening, StaffPortalProfile, Task, TaskDisplayStatus } from '@/types/staffPortal'

export function getMyProfile(): Promise<{ profile: StaffPortalProfile }> {
  return api.get('/staff-portal/profile')
}

export interface MyShiftFilters {
  status?: ShiftStatus
  dateFrom?: string
  dateTo?: string
}

export function listMyShifts(filters: MyShiftFilters = {}): Promise<{ shifts: Shift[] }> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  const query = params.toString()
  return api.get(`/staff-portal/shifts${query ? `?${query}` : ''}`)
}

export function listAvailableShifts(): Promise<{ openings: ShiftOpening[] }> {
  return api.get('/staff-portal/shift-openings')
}

export function applyToShift(
  openingId: string,
  input: { message?: string } = {},
): Promise<{ application: ShiftApplication }> {
  return api.post(`/staff-portal/shift-openings/${openingId}/apply`, input)
}

export function listMyApplications(): Promise<{ applications: ShiftApplication[] }> {
  return api.get('/staff-portal/shift-applications')
}

export function withdrawMyApplication(id: string): Promise<{ application: ShiftApplication }> {
  return api.del(`/staff-portal/shift-applications/${id}`)
}

export function listMyTasks(filters: { status?: TaskDisplayStatus } = {}): Promise<{ tasks: Task[] }> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  return api.get(`/staff-portal/tasks${query ? `?${query}` : ''}`)
}

export function updateMyTaskStatus(id: string, status: SettableTaskStatus): Promise<{ task: Task }> {
  return api.patch(`/staff-portal/tasks/${id}/status`, { status })
}
