import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Where the user currently is in the app -- lets the assistant answer
 *  "what is this?" using the resource actually on screen. Just the route,
 *  never anything the user typed or any resource content. */
export class AssistantContextDto {
  @IsString()
  @MaxLength(200)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;
}

export class AssistantHistoryTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class AssistantChatDto {
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(1000, { message: 'Message is too long' })
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context?: AssistantContextDto;

  /** Short client-held conversation history for follow-up turns (e.g. "what
   *  is this?" after a prior answer). Capped well below what the model's
   *  context window needs -- this is a lightweight assistant, not a full
   *  chat product. Never persisted server-side. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'Conversation history is too long' })
  @ValidateNested({ each: true })
  @Type(() => AssistantHistoryTurnDto)
  history?: AssistantHistoryTurnDto[];
}
