import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, MinLength, ValidateNested } from 'class-validator';
import { InvoiceItemInputDto } from './invoice-item-input.dto';

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1, { message: 'Patient is required' })
  patientId!: string;

  @IsString()
  @MinLength(2, { message: 'Describe the charges' })
  description!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line item' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items!: InvoiceItemInputDto[];

  @IsString()
  @MinLength(1, { message: 'Due date is required' })
  dueDate!: string;
}
