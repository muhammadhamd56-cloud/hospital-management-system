import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

/** Positive delta restocks, negative delta dispenses. */
export class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  delta!: number;
}
