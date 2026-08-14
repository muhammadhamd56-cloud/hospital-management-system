import { IsIn, IsOptional, IsString } from 'class-validator';
import type { ClientLabTestStatus } from '../laboratory.mapper';

export class UpdateLabTestStatusDto {
  @IsIn(['pending', 'in-progress', 'completed'])
  status!: ClientLabTestStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string;
}
