import { IsOptional, IsString, MaxLength } from 'class-validator';

/** At least one of doctorId/staffId/teamName must be supplied -- validated in
 *  the service, since class-validator doesn't cleanly express "at least one
 *  of" across independent optional fields. */
export class AssignEmergencyDto {
  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  teamName?: string;
}
