export interface DailyAdmissions {
  day: string
  admissions: number
}

/** Illustrative 7-day trend — not derived from the patient mock data, which
 *  has no per-day admission timestamps. */
export const WEEKLY_ADMISSIONS: DailyAdmissions[] = [
  { day: 'Wed', admissions: 14 },
  { day: 'Thu', admissions: 18 },
  { day: 'Fri', admissions: 22 },
  { day: 'Sat', admissions: 16 },
  { day: 'Sun', admissions: 11 },
  { day: 'Mon', admissions: 20 },
  { day: 'Tue', admissions: 24 },
]

export type AlertPriority = 'high' | 'medium' | 'low'

export interface EmergencyAlert {
  id: string
  title: string
  description: string
  priority: AlertPriority
}

export interface RecentPatientEntry {
  id: string
  name: string
  age: number
  gender: 'male' | 'female' | 'other'
  admittedAt: string
}

export const RECENT_PATIENTS: RecentPatientEntry[] = [
  { id: 'P-1008', name: 'Robert Thomas', age: 63, gender: 'male', admittedAt: '2026-08-02T07:45:00' },
  { id: 'P-1002', name: 'Michael Chen', age: 47, gender: 'male', admittedAt: '2026-08-02T06:10:00' },
  { id: 'P-1012', name: 'Benjamin Harris', age: 57, gender: 'male', admittedAt: '2026-08-01T22:30:00' },
  { id: 'P-1004', name: 'James Wilson', age: 52, gender: 'male', admittedAt: '2026-08-01T18:15:00' },
  { id: 'P-1001', name: 'Sarah Johnson', age: 34, gender: 'female', admittedAt: '2026-08-01T14:50:00' },
]

export const EMERGENCY_ALERTS: EmergencyAlert[] = [
  {
    id: 'alert-1',
    title: 'ICU Nearly Full',
    description: '18 of 20 ICU beds occupied',
    priority: 'high',
  },
  {
    id: 'alert-2',
    title: 'Blood O- Low',
    description: 'Only 4 units remaining in the blood bank',
    priority: 'high',
  },
  {
    id: 'alert-3',
    title: 'Emergency Patient Waiting',
    description: 'Triage wait time exceeds 15 minutes',
    priority: 'medium',
  },
]
