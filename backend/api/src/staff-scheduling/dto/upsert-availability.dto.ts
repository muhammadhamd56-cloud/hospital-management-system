import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, Matches, ValidateNested } from 'class-validator';
import { TIME_OF_DAY_PATTERN } from './create-template.dto';
import { CLIENT_DAYS_OF_WEEK, ClientDayOfWeek } from './day-of-week';

export class DayAvailabilityDto {
  @IsIn(CLIENT_DAYS_OF_WEEK)
  dayOfWeek!: ClientDayOfWeek;

  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid start time (HH:mm)' })
  availableFrom?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'Enter a valid end time (HH:mm)' })
  availableTo?: string;
}

export class UpsertAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayAvailabilityDto)
  days!: DayAvailabilityDto[];
}
