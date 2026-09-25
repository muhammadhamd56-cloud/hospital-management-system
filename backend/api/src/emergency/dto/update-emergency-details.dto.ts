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

/** The patient's optional post-creation follow-up: "what kind of emergency is this?" */
export class UpdateEmergencyDetailsDto {
  @IsIn(EMERGENCY_TYPES)
  emergencyType!: ClientEmergencyType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
