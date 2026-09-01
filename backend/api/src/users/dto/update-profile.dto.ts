import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsE164PhoneNumber } from '../../common/validators/is-e164-phone-number.validator';

export const GENDER_OPTIONS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name cannot be empty' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Last name cannot be empty' })
  lastName?: string;

  /** E.164 format (e.g. "+923001234567"), or "" to clear a previously-set
   *  number. The frontend converts to E.164 before sending -- this is the
   *  server-side revalidation, not the only check. */
  @IsOptional()
  @IsString()
  @IsE164PhoneNumber()
  phone?: string;

  /**
   * Patient-facing fields -- harmless (just unused) if sent by another
   * role, since this endpoint only ever writes to the caller's own row.
   * Each accepts "" to explicitly clear a previously-set value.
   */
  @IsOptional()
  @ValidateIf((dto: UpdateProfileDto) => dto.dateOfBirth !== '')
  @IsDateString({}, { message: 'Enter a valid date of birth' })
  dateOfBirth?: string;

  @IsOptional()
  @ValidateIf((dto: UpdateProfileDto) => dto.gender !== '')
  @IsIn(GENDER_OPTIONS, { message: 'Select a valid gender' })
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Address is too long' })
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Emergency contact is too long' })
  emergencyContact?: string;
}
