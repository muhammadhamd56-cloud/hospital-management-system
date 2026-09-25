import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddEmergencyNoteDto {
  @IsString()
  @MinLength(1, { message: 'Note cannot be empty' })
  @MaxLength(2000)
  body!: string;
}
