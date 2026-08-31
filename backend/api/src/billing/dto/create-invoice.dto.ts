import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
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

  /** Invoice-level discount, applied after summing line items. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Discount cannot be negative' })
  discount?: number;

  /** Invoice-level tax, applied after the discount. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Tax cannot be negative' })
  tax?: number;

  @IsString()
  @MinLength(1, { message: 'Due date is required' })
  dueDate!: string;
}
