import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Payment amount must be greater than 0' })
  amount!: number;

  @IsEnum(PaymentMethod, { message: 'Select a valid payment method' })
  method!: PaymentMethod;
}
