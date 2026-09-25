import { IsLatitude, IsLongitude } from 'class-validator';

/** Only ever sent when the patient explicitly taps "Allow Location" -- see section 6. */
export class ShareLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
