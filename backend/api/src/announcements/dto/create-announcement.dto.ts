import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type ClientAnnouncementPriority = 'normal' | 'important' | 'urgent';

export const ANNOUNCEMENT_PRIORITIES: ClientAnnouncementPriority[] = ['normal', 'important', 'urgent'];

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(150)
  title!: string;

  @IsString()
  @MinLength(1, { message: 'Description is required' })
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_PRIORITIES)
  priority?: ClientAnnouncementPriority;
}
