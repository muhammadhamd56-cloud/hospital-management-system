import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** ~1.8MB of base64, enough headroom above the client's compressed-image cap. */
const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000;

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Message is too long' })
  body?: string;

  /** A compressed image encoded client-side as a data URL. Optional -- a message needs a body, an image, or both. */
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpe?g|gif|webp);base64,/, { message: 'Unsupported image format' })
  @MaxLength(MAX_IMAGE_DATA_URL_LENGTH, { message: 'Image is too large' })
  imageUrl?: string;
}
