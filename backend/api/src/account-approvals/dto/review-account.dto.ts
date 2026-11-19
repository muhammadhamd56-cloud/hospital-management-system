import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewAccountDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  /** Shown to the applicant when rejecting. Ignored on approval. */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Note is too long' })
  note?: string;
}

export class ListAccountRequestsDto {
  @IsOptional()
  @IsIn(['pending', 'rejected'])
  status?: 'pending' | 'rejected';
}
