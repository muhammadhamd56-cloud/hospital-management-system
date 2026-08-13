import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class PrescriptionInputDto {
  @IsString()
  @MinLength(1, { message: 'Medication name is required' })
  medicationName!: string;

  @IsString()
  @MinLength(1, { message: 'Dosage is required' })
  dosage!: string;

  @IsString()
  @MinLength(1, { message: 'Frequency is required' })
  frequency!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Duration must be at least 1 day' })
  @Max(365)
  durationDays!: number;

  @IsOptional()
  @IsString()
  instructions?: string;
}
