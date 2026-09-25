export type EmergencyType =
  | 'medical'
  | 'accident_injury'
  | 'breathing_difficulty'
  | 'chest_related'
  | 'unconscious_person'
  | 'severe_bleeding'
  | 'other'

export const EMERGENCY_TYPES: EmergencyType[] = [
  'medical',
  'accident_injury',
  'breathing_difficulty',
  'chest_related',
  'unconscious_person',
  'severe_bleeding',
  'other',
]

export const EMERGENCY_TYPE_LABELS: Record<EmergencyType, string> = {
  medical: 'Medical emergency',
  accident_injury: 'Accident / injury',
  breathing_difficulty: 'Breathing difficulty',
  chest_related: 'Chest-related emergency',
  unconscious_person: 'Unconscious person',
  severe_bleeding: 'Severe bleeding',
  other: 'Other',
}

export type EmergencyPriority = 'critical' | 'high' | 'normal'

export const EMERGENCY_PRIORITIES: EmergencyPriority[] = ['critical', 'high', 'normal']

export const EMERGENCY_PRIORITY_LABELS: Record<EmergencyPriority, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
}

export type EmergencyStatus =
  | 'new'
  | 'acknowledged'
  | 'team_assigned'
  | 'responding'
  | 'arrived'
  | 'resolved'
  | 'cancelled'

export const EMERGENCY_STATUSES: EmergencyStatus[] = [
  'new',
  'acknowledged',
  'team_assigned',
  'responding',
  'arrived',
  'resolved',
  'cancelled',
]

export const EMERGENCY_STATUS_LABELS: Record<EmergencyStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  team_assigned: 'Team Assigned',
  responding: 'Responding',
  arrived: 'Arrived',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

/** A case is still open/in-flight -- used to gate "you have an active
 *  request" banners and to disable creating a second one client-side (the
 *  server's 409 on POST /emergency is the real guard). */
export const ACTIVE_EMERGENCY_STATUSES: EmergencyStatus[] = [
  'new',
  'acknowledged',
  'team_assigned',
  'responding',
  'arrived',
]

export interface EmergencyCaseSummary {
  id: string
  patientId: string
  patientName: string
  emergencyType: EmergencyType
  priority: EmergencyPriority
  status: EmergencyStatus
  locationShared: boolean
  assignedDoctorName: string | null
  assignedStaffName: string | null
  assignedTeamName: string | null
  createdAt: string
  acknowledgedAt: string | null
  assignedAt: string | null
  respondingAt: string | null
  arrivedAt: string | null
  resolvedAt: string | null
  cancelledAt: string | null
}

export interface EmergencyNote {
  id: string
  authorName: string | null
  body: string
  createdAt: string
}

export interface EmergencyTimelineEvent {
  label: string
  actorName: string | null
  createdAt: string
}

export interface EmergencyCaseDetail extends EmergencyCaseSummary {
  description: string | null
  cancelReason: string | null
  acknowledgedByName: string | null
  assignedByName: string | null
  resolvedByName: string | null
  location: { lat: number; lng: number } | null
  patientContact?: {
    phone: string | null
    dateOfBirth: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
  }
  notes: EmergencyNote[]
  timeline: EmergencyTimelineEvent[]
}

export interface AssignableNurse {
  id: string
  fullName: string
}

export interface EmergencyAnalytics {
  totalCases: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byType: Record<string, number>
  avgAcknowledgeSeconds: number | null
  avgAssignSeconds: number | null
  avgResponseSeconds: number | null
  avgResolutionSeconds: number | null
  volumeByDay: { date: string; count: number }[]
}
