import { IsOptional, IsString, MinLength } from 'class-validator';
import { IsE164PhoneNumber } from '../../common/validators/is-e164-phone-number.validator';

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
}
