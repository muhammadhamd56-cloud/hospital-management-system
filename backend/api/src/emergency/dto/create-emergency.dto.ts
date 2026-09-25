import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ClientEmergencyType } from '../emergency.mapper';

const EMERGENCY_TYPES: ClientEmergencyType[] = [
  'medical',
  'accident_injury',
  'breathing_difficulty',
  'chest_related',
  'unconscious_person',
  'severe_bleeding',
  'other',
];

/**
 * Every field is optional -- per the plan, hitting "Confirm Emergency" creates
 * the case immediately (type defaults to "other" in the service). Type and
 * description are only ever gathered as an optional follow-up afterward, so a
 * genuine emergency is never held up by a form.
 */
export class CreateEmergencyDto {
  @IsOptional()
  @IsIn(EMERGENCY_TYPES)
  emergencyType?: ClientEmergencyType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
