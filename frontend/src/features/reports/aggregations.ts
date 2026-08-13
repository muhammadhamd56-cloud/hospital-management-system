import { MOCK_APPOINTMENTS } from '@/features/appointments/mockAppointments'
import { MOCK_PATIENTS } from '@/features/patients/mockPatients'

export interface DepartmentCount {
  department: string
  count: number
}

export function appointmentsByDepartment(): DepartmentCount[] {
  const counts = new Map<string, number>()
  for (const appointment of MOCK_APPOINTMENTS) {
    counts.set(appointment.department, (counts.get(appointment.department) ?? 0) + 1)
  }
  return Array.from(counts, ([department, count]) => ({ department, count })).sort(
    (a, b) => b.count - a.count,
  )
}

export interface PatientStatusCount {
  status: string
  count: number
}

export function patientStatusDistribution(): PatientStatusCount[] {
  const counts = new Map<string, number>()
  for (const patient of MOCK_PATIENTS) {
    counts.set(patient.status, (counts.get(patient.status) ?? 0) + 1)
  }
  return Array.from(counts, ([status, count]) => ({
    status: status[0].toUpperCase() + status.slice(1),
    count,
  }))
}

export interface MonthlyRevenue {
  month: string
  revenue: number
}

/** Illustrative 6-month trend — the mock invoice dataset only spans a few
 *  months, too sparse for a meaningful trend line. */
export const MONTHLY_REVENUE: MonthlyRevenue[] = [
  { month: 'Mar', revenue: 84200 },
  { month: 'Apr', revenue: 91500 },
  { month: 'May', revenue: 88700 },
  { month: 'Jun', revenue: 102300 },
  { month: 'Jul', revenue: 118900 },
  { month: 'Aug', revenue: 128940 },
]
