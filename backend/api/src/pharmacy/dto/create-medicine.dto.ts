import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';
import type { ClientMedicineCategory } from '../pharmacy.mapper';

const CATEGORIES: ClientMedicineCategory[] = [
  'Analgesic',
  'Antibiotic',
  'Antiviral',
  'Cardiovascular',
  'Gastrointestinal',
  'Respiratory',
  'Vitamins & Supplements',
];

export class CreateMedicineDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  name!: string;

  @IsIn(CATEGORIES)
  category!: ClientMedicineCategory;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  @IsString()
  @MinLength(1, { message: 'Unit is required' })
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsDateString()
  expiryDate!: string;
}
