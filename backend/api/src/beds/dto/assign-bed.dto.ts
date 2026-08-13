import { IsString, MinLength } from 'class-validator';

export class AssignBedDto {
  @IsString()
  @MinLength(1, { message: 'Patient is required' })
  patientId!: string;
}
