import { EmergencyPriority, EmergencyStatus, EmergencyType } from '@prisma/client';
import type { AuditLog, Doctor, EmergencyCase, EmergencyNote, Staff, User } from '@prisma/client';

export type ClientEmergencyType =
  | 'medical'
  | 'accident_injury'
  | 'breathing_difficulty'
  | 'chest_related'
  | 'unconscious_person'
  | 'severe_bleeding'
  | 'other';

export type ClientEmergencyPriority = 'critical' | 'high' | 'normal';

export type ClientEmergencyStatus =
  | 'new'
  | 'acknowledged'
  | 'team_assigned'
  | 'responding'
  | 'arrived'
  | 'resolved'
  | 'cancelled';

const TYPE_TO_PRISMA: Record<ClientEmergencyType, EmergencyType> = {
  medical: EmergencyType.MEDICAL,
  accident_injury: EmergencyType.ACCIDENT_INJURY,
  breathing_difficulty: EmergencyType.BREATHING_DIFFICULTY,
  chest_related: EmergencyType.CHEST_RELATED,
  unconscious_person: EmergencyType.UNCONSCIOUS_PERSON,
  severe_bleeding: EmergencyType.SEVERE_BLEEDING,
  other: EmergencyType.OTHER,
};

const TYPE_TO_CLIENT: Record<EmergencyType, ClientEmergencyType> = {
  [EmergencyType.MEDICAL]: 'medical',
  [EmergencyType.ACCIDENT_INJURY]: 'accident_injury',
  [EmergencyType.BREATHING_DIFFICULTY]: 'breathing_difficulty',
  [EmergencyType.CHEST_RELATED]: 'chest_related',
  [EmergencyType.UNCONSCIOUS_PERSON]: 'unconscious_person',
  [EmergencyType.SEVERE_BLEEDING]: 'severe_bleeding',
  [EmergencyType.OTHER]: 'other',
};

const PRIORITY_TO_PRISMA: Record<ClientEmergencyPriority, EmergencyPriority> = {
  critical: EmergencyPriority.CRITICAL,
  high: EmergencyPriority.HIGH,
  normal: EmergencyPriority.NORMAL,
};

const PRIORITY_TO_CLIENT: Record<EmergencyPriority, ClientEmergencyPriority> = {
  [EmergencyPriority.CRITICAL]: 'critical',
  [EmergencyPriority.HIGH]: 'high',
  [EmergencyPriority.NORMAL]: 'normal',
};

const STATUS_TO_PRISMA: Record<ClientEmergencyStatus, EmergencyStatus> = {
  new: EmergencyStatus.NEW,
  acknowledged: EmergencyStatus.ACKNOWLEDGED,
  team_assigned: EmergencyStatus.TEAM_ASSIGNED,
  responding: EmergencyStatus.RESPONDING,
  arrived: EmergencyStatus.ARRIVED,
  resolved: EmergencyStatus.RESOLVED,
  cancelled: EmergencyStatus.CANCELLED,
};

const STATUS_TO_CLIENT: Record<EmergencyStatus, ClientEmergencyStatus> = {
  [EmergencyStatus.NEW]: 'new',
  [EmergencyStatus.ACKNOWLEDGED]: 'acknowledged',
  [EmergencyStatus.TEAM_ASSIGNED]: 'team_assigned',
  [EmergencyStatus.RESPONDING]: 'responding',
  [EmergencyStatus.ARRIVED]: 'arrived',
  [EmergencyStatus.RESOLVED]: 'resolved',
  [EmergencyStatus.CANCELLED]: 'cancelled',
};

export function toPrismaEmergencyType(type: ClientEmergencyType): EmergencyType {
  return TYPE_TO_PRISMA[type];
}

export function toClientEmergencyType(type: EmergencyType): ClientEmergencyType {
  return TYPE_TO_CLIENT[type];
}

export function toPrismaEmergencyPriority(priority: ClientEmergencyPriority): EmergencyPriority {
  return PRIORITY_TO_PRISMA[priority];
}

export function toClientEmergencyPriority(priority: EmergencyPriority): ClientEmergencyPriority {
  return PRIORITY_TO_CLIENT[priority];
}

export function toPrismaEmergencyStatus(status: ClientEmergencyStatus): EmergencyStatus {
  return STATUS_TO_PRISMA[status];
}

export function toClientEmergencyStatus(status: EmergencyStatus): ClientEmergencyStatus {
  return STATUS_TO_CLIENT[status];
}

type NameParts = Pick<User, 'firstName' | 'lastName'>;

function fullName(user: NameParts | null | undefined): string | null {
  return user ? `${user.firstName} ${user.lastName}`.trim() : null;
}

export type EmergencyCaseWithRelations = EmergencyCase & {
  patient: Pick<User, 'firstName' | 'lastName' | 'phone' | 'dateOfBirth' | 'emergencyContactName' | 'emergencyContactPhone'>;
  acknowledgedBy: NameParts | null;
  assignedDoctor: (Doctor & { user: NameParts }) | null;
  assignedStaff: (Staff & { user: NameParts | null }) | null;
  assignedBy: NameParts | null;
  resolvedBy: NameParts | null;
};

/** Summary shape used in list views -- deliberately omits location, per section 6/25: raw
 *  coordinates are only ever included in the single-case detail response for an authorized responder. */
export interface EmergencyCaseSummary {
  id: string;
  patientId: string;
  patientName: string;
  emergencyType: ClientEmergencyType;
  priority: ClientEmergencyPriority;
  status: ClientEmergencyStatus;
  locationShared: boolean;
  assignedDoctorName: string | null;
  assignedStaffName: string | null;
  assignedTeamName: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  assignedAt: string | null;
  respondingAt: string | null;
  arrivedAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
}

export interface EmergencyCaseDetail extends EmergencyCaseSummary {
  description: string | null;
  cancelReason: string | null;
  acknowledgedByName: string | null;
  assignedByName: string | null;
  resolvedByName: string | null;
  /** Only populated when locationShared is true AND the caller is an authorized responder. */
  location: { lat: number; lng: number } | null;
  /** Present only for a responder -- never sent to the patient's own view of their case. */
  patientContact?: {
    phone: string | null;
    dateOfBirth: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
  notes: EmergencyNoteResponse[];
  timeline: EmergencyTimelineEvent[];
}

export interface EmergencyNoteResponse {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface EmergencyTimelineEvent {
  label: string;
  actorName: string | null;
  createdAt: string;
}

export interface AssignableNurse {
  id: string;
  fullName: string;
}

export function toAssignableNurse(staff: Staff & { user: NameParts | null }): AssignableNurse {
  return { id: staff.id, fullName: fullName(staff.user) ?? staff.fullName };
}

export function toEmergencyCaseSummary(emergencyCase: EmergencyCaseWithRelations): EmergencyCaseSummary {
  return {
    id: emergencyCase.id,
    patientId: emergencyCase.patientId,
    patientName: fullName(emergencyCase.patient) ?? 'Unknown patient',
    emergencyType: toClientEmergencyType(emergencyCase.emergencyType),
    priority: toClientEmergencyPriority(emergencyCase.priority),
    status: toClientEmergencyStatus(emergencyCase.status),
    locationShared: emergencyCase.locationShared,
    assignedDoctorName: emergencyCase.assignedDoctor ? fullName(emergencyCase.assignedDoctor.user) : null,
    assignedStaffName: emergencyCase.assignedStaff ? fullName(emergencyCase.assignedStaff.user) : null,
    assignedTeamName: emergencyCase.assignedTeamName,
    createdAt: emergencyCase.createdAt.toISOString(),
    acknowledgedAt: emergencyCase.acknowledgedAt?.toISOString() ?? null,
    assignedAt: emergencyCase.assignedAt?.toISOString() ?? null,
    respondingAt: emergencyCase.respondingAt?.toISOString() ?? null,
    arrivedAt: emergencyCase.arrivedAt?.toISOString() ?? null,
    resolvedAt: emergencyCase.resolvedAt?.toISOString() ?? null,
    cancelledAt: emergencyCase.cancelledAt?.toISOString() ?? null,
  };
}

export function toEmergencyCaseDetail(
  emergencyCase: EmergencyCaseWithRelations & { notes: (EmergencyNote & { author: NameParts | null })[] },
  options: { includeLocation: boolean; includePatientContact: boolean; timeline: EmergencyTimelineEvent[] },
): EmergencyCaseDetail {
  return {
    ...toEmergencyCaseSummary(emergencyCase),
    description: emergencyCase.description,
    cancelReason: emergencyCase.cancelReason,
    acknowledgedByName: fullName(emergencyCase.acknowledgedBy),
    assignedByName: fullName(emergencyCase.assignedBy),
    resolvedByName: fullName(emergencyCase.resolvedBy),
    location:
      options.includeLocation && emergencyCase.locationShared && emergencyCase.locationLat !== null && emergencyCase.locationLng !== null
        ? { lat: emergencyCase.locationLat, lng: emergencyCase.locationLng }
        : null,
    ...(options.includePatientContact
      ? {
          patientContact: {
            phone: emergencyCase.patient.phone,
            dateOfBirth: emergencyCase.patient.dateOfBirth?.toISOString() ?? null,
            emergencyContactName: emergencyCase.patient.emergencyContactName,
            emergencyContactPhone: emergencyCase.patient.emergencyContactPhone,
          },
        }
      : {}),
    notes: emergencyCase.notes.map((note) => ({
      id: note.id,
      authorName: fullName(note.author),
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
    timeline: options.timeline,
  };
}

const TRANSITION_LABELS: Record<string, string> = {
  'CREATE:EmergencyCase': 'Emergency request created',
  'UPDATE:acknowledged': 'Acknowledged',
  'UPDATE:team_assigned': 'Team assigned',
  'UPDATE:responding': 'Marked as responding',
  'UPDATE:arrived': 'Team arrived',
  'UPDATE:resolved': 'Case resolved',
  'UPDATE:cancelled': 'Case cancelled',
  'UPDATE:priority': 'Priority changed',
  'UPDATE:note': 'Note added',
  'UPDATE:location_shared': 'Location shared',
  'VIEW:location': 'Location viewed',
};

/** Turns the AuditLog rows for this case into the human-readable timeline the
 *  case-detail page shows -- see the "no new timeline table" note on the
 *  EmergencyCase model in schema.prisma. */
export function toEmergencyTimeline(
  logs: (AuditLog & { actor: NameParts | null })[],
): EmergencyTimelineEvent[] {
  return logs.map((log) => {
    const metadata = (log.metadata as Record<string, unknown> | null) ?? {};
    const key = `${log.action}:${typeof metadata.transition === 'string' ? metadata.transition : 'EmergencyCase'}`;
    return {
      label: TRANSITION_LABELS[key] ?? `${log.action.charAt(0)}${log.action.slice(1).toLowerCase()}`,
      actorName: fullName(log.actor),
      createdAt: log.createdAt.toISOString(),
    };
  });
}
