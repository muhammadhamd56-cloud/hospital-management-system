import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AI_DOMAINS } from '../tools/ai-tool.types';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  /** UI context only -- recorded, never used for authorization. */
  @IsOptional()
  @IsIn(AI_DOMAINS)
  activeModule?: string;
}

export class RenameConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}

export class SendCopilotMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(4000, { message: 'Message is too long' })
  message!: string;

  @IsOptional()
  @IsIn(AI_DOMAINS)
  activeModule?: string;

  /** Client-generated idempotency key: resubmitting the same key never starts a second run. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'requestKey must be 8-64 URL-safe characters' })
  requestKey!: string;
}

export class ApproveProposalDto {
  /** The paramsHash shown with the proposal -- binds the approval to exactly what was reviewed. */
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'paramsHash must be the proposal hash' })
  paramsHash!: string;
}

export class RejectProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FeedbackDto {
  @IsIn(['up', 'down'])
  rating!: 'up' | 'down';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UsageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class PageQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  cursor?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  before?: string;
}
