import { IsIn } from 'class-validator';
import type { ClientEmergencyPriority } from '../emergency.mapper';

const PRIORITIES: ClientEmergencyPriority[] = ['critical', 'high', 'normal'];

export class UpdateEmergencyPriorityDto {
  @IsIn(PRIORITIES)
  priority!: ClientEmergencyPriority;
}
