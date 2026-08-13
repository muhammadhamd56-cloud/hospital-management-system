import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1, { message: 'Patient is required' })
  patientId!: string;

  @IsString()
  @MinLength(2, { message: 'Describe the charges' })
  description!: string;

  @IsNumber()
  @IsPositive({ message: 'Amount must be greater than 0' })
  amount!: number;

  @IsString()
  @MinLength(1, { message: 'Due date is required' })
  dueDate!: string;
}
