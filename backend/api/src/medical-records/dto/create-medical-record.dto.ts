import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { PrescriptionInputDto } from './prescription-input.dto';

export class CreateMedicalRecordDto {
  /** If set, must be an appointment between the calling doctor and this patient. */
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsString()
  @MinLength(1, { message: 'Diagnosis is required' })
  diagnosis!: string;

  @IsString()
  @MinLength(1, { message: 'Notes are required' })
  notes!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionInputDto)
  prescriptions?: PrescriptionInputDto[];
}
