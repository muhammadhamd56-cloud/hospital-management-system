import { api } from '@/lib/apiClient'
import type {
  AssignableNurse,
  EmergencyAnalytics,
  EmergencyCaseDetail,
  EmergencyCaseSummary,
  EmergencyPriority,
  EmergencyStatus,
  EmergencyType,
} from '@/types/emergency'

export interface CreateEmergencyInput {
  emergencyType?: EmergencyType
  description?: string
}

export function createEmergency(input: CreateEmergencyInput): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.post('/emergency', input)
}

export function listMyEmergencies(): Promise<{ emergencyCases: EmergencyCaseSummary[] }> {
  return api.get('/emergency/my')
}

export interface ListEmergenciesFilters {
  status?: EmergencyStatus
  priority?: EmergencyPriority
  emergencyType?: EmergencyType
  assignedStaffId?: string
  assignedDoctorId?: string
}

export function listEmergencies(filters: ListEmergenciesFilters = {}): Promise<{ emergencyCases: EmergencyCaseSummary[] }> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return api.get(`/emergency${query ? `?${query}` : ''}`)
}

export function getEmergency(id: string): Promise<{ emergencyCase: EmergencyCaseDetail }> {
  return api.get(`/emergency/${id}`)
}

export function updateEmergencyDetails(
  id: string,
  input: { emergencyType: EmergencyType; description?: string },
): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.patch(`/emergency/${id}/details`, input)
}

export function shareEmergencyLocation(
  id: string,
  input: { lat: number; lng: number },
): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.patch(`/emergency/${id}/location`, input)
}

export function updateEmergencyStatus(
  id: string,
  status: EmergencyStatus,
): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.patch(`/emergency/${id}/status`, { status })
}

export interface AssignEmergencyInput {
  doctorId?: string
  staffId?: string
  teamName?: string
}

export function assignEmergency(id: string, input: AssignEmergencyInput): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.patch(`/emergency/${id}/assign`, input)
}

export function updateEmergencyPriority(
  id: string,
  priority: EmergencyPriority,
): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.patch(`/emergency/${id}/priority`, { priority })
}

export function addEmergencyNote(id: string, body: string): Promise<{ emergencyCase: EmergencyCaseDetail }> {
  return api.post(`/emergency/${id}/notes`, { body })
}

export function cancelEmergency(id: string, reason?: string): Promise<{ emergencyCase: EmergencyCaseSummary }> {
  return api.post(`/emergency/${id}/cancel`, { reason })
}

export function listAssignableNurses(): Promise<{ nurses: AssignableNurse[] }> {
  return api.get('/emergency/assignable-nurses')
}

export function getEmergencyAnalytics(): Promise<EmergencyAnalytics> {
  return api.get('/emergency/analytics')
}
