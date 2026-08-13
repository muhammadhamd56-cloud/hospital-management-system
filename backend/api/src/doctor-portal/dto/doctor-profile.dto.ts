import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class DoctorProfileDto {
  @IsString()
  @MinLength(1, { message: 'Specialization is required' })
  specialization!: string;

  @IsString()
  @MinLength(1, { message: 'Department is required' })
  department!: string;

  @IsString()
  @MinLength(1, { message: 'Bio is required' })
  bio!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Experience must be 0 or more' })
  @Max(80)
  experienceYears!: number;
}
