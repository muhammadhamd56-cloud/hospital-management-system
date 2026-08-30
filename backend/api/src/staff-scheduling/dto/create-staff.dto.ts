import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

export type ClientStaffType =
  | 'doctor'
  | 'nurse'
  | 'receptionist'
  | 'pharmacist'
  | 'lab_technician'
  | 'other';

export const CLIENT_STAFF_TYPES: ClientStaffType[] = [
  'doctor',
  'nurse',
  'receptionist',
  'pharmacist',
  'lab_technician',
  'other',
];

/** Staff types that always require linking an existing User login account
 *  (never a name-only entry). Every other staff type may EITHER link an
 *  existing (STAFF-role) account OR be a name-only roster row -- see
 *  CreateStaffDto.userId/fullName below. */
export const STAFF_TYPES_REQUIRING_USER: ClientStaffType[] = ['doctor'];

export class CreateStaffDto {
  @IsIn(CLIENT_STAFF_TYPES)
  staffType!: ClientStaffType;

  @ValidateIf(
    (dto: CreateStaffDto) => STAFF_TYPES_REQUIRING_USER.includes(dto.staffType) || Boolean(dto.userId),
  )
  @IsString()
  @MinLength(1, { message: 'Select an existing user account for this staff type' })
  userId?: string;

  @ValidateIf((dto: CreateStaffDto) => !STAFF_TYPES_REQUIRING_USER.includes(dto.staffType) && !dto.userId)
  @IsString()
  @MinLength(1, { message: 'Full name is required' })
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  // Departments are name-keyed across the app (see StaffService.create's
  // doctor branch) -- no separate department-ID picker exists anywhere.
  @IsOptional()
  @IsString()
  department?: string;
}
