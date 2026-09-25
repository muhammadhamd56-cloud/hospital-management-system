import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class RefundPaymentDto {
  /** Defaults to the payment's full refundable balance when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Refund amount must be greater than 0' })
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Reason is too long' })
  reason?: string;
}
