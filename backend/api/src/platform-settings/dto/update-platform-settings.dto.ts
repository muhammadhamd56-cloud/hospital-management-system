import { IsNumber, Min } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsNumber()
  @Min(0, { message: 'Consultation margin cannot be negative' })
  consultationMargin!: number;
}
