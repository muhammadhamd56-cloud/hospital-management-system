import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsPositive, IsString, Max, Min, MinLength } from 'class-validator';

export class InvoiceItemInputDto {
  @IsString()
  @MinLength(1, { message: 'Describe this line item' })
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(9999)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Unit price must be greater than 0' })
  unitPrice!: number;
}
