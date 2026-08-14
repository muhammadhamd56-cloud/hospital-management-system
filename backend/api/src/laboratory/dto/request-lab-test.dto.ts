import { IsIn, IsString, MinLength } from 'class-validator';
import type { ClientLabTestCategory } from '../laboratory.mapper';

const CATEGORIES: ClientLabTestCategory[] = ['Hematology', 'Biochemistry', 'Microbiology', 'Radiology', 'Pathology'];

export class RequestLabTestDto {
  @IsString()
  @MinLength(1, { message: 'Patient is required' })
  patientId!: string;

  @IsString()
  @MinLength(1, { message: 'Doctor is required' })
  doctorId!: string;

  @IsString()
  @MinLength(1, { message: 'Test name is required' })
  testName!: string;

  @IsIn(CATEGORIES)
  category!: ClientLabTestCategory;
}
