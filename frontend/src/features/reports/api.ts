import { api } from '@/lib/apiClient'
import type { DepartmentCount, MonthlyRevenue, StatusCount } from '@/features/reports/aggregations'

export function getRevenueTrend(): Promise<{ data: MonthlyRevenue[] }> {
  return api.get('/reports/revenue-trend')
}

export function getAppointmentsByDepartment(): Promise<{ data: DepartmentCount[] }> {
  return api.get('/reports/appointments-by-department')
}

export function getAppointmentsByStatus(): Promise<{ data: StatusCount[] }> {
  return api.get('/reports/appointments-by-status')
}
