import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type ApplicationDecision = 'approve' | 'reject';

export class RespondShiftApplicationDto {
  @IsIn(['approve', 'reject'])
  decision!: ApplicationDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Keep your note under 500 characters' })
  adminNotes?: string;
}
