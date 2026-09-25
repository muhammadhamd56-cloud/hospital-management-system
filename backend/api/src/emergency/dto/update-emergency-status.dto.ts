import { IsIn } from 'class-validator';
import type { ClientEmergencyStatus } from '../emergency.mapper';

const RESPONDER_SETTABLE_STATUSES: ClientEmergencyStatus[] = [
  'acknowledged',
  'responding',
  'arrived',
  'resolved',
];

export class UpdateEmergencyStatusDto {
  @IsIn(RESPONDER_SETTABLE_STATUSES)
  status!: ClientEmergencyStatus;
}
