import { IsIn, IsOptional, IsString } from 'class-validator';
import type { ClientEmergencyPriority, ClientEmergencyStatus, ClientEmergencyType } from '../emergency.mapper';

const STATUSES: ClientEmergencyStatus[] = [
  'new',
  'acknowledged',
  'team_assigned',
  'responding',
  'arrived',
  'resolved',
  'cancelled',
];
const PRIORITIES: ClientEmergencyPriority[] = ['critical', 'high', 'normal'];
const TYPES: ClientEmergencyType[] = [
  'medical',
  'accident_injury',
  'breathing_difficulty',
  'chest_related',
  'unconscious_person',
  'severe_bleeding',
  'other',
];

/** Query filters for the Emergency Center list -- all optional, all AND-ed together. */
export class ListEmergenciesDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: ClientEmergencyStatus;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: ClientEmergencyPriority;

  @IsOptional()
  @IsIn(TYPES)
  emergencyType?: ClientEmergencyType;

  @IsOptional()
  @IsString()
  assignedStaffId?: string;

  @IsOptional()
  @IsString()
  assignedDoctorId?: string;
}
