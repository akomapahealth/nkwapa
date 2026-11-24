import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StaffFeedbackCategory, StationKind } from '@prisma/client';
import { ToSanitizedString } from '../../common/validation';

/** What the device attached to a report, and showed the reporter before sending. */
export class StaffFeedbackContextDto {
  /** The page, with ids already replaced by `:id` on the device. */
  @IsString()
  @MaxLength(200)
  @Matches(/^\/[\w\-/:[\]().]*$/, { message: 'route must be a path' })
  route!: string;

  @IsString()
  @MaxLength(120)
  role!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  version?: string | null;

  @IsBoolean()
  online!: boolean;

  @IsInt()
  @Min(0)
  @Max(100_000)
  outboxSize!: number;

  /** When the reporter pressed Send, on the device. */
  @IsISO8601({ strict: true })
  occurredAt!: string;
}

/** A "Report a problem" queued in the outbox (#422). The report id is the mutation's entityId. */
export class StaffFeedbackReplayPayload {
  @Equals(1)
  schemaVersion!: 1;

  @IsEnum(StaffFeedbackCategory)
  category!: StaffFeedbackCategory;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 500, preserveNewlines: true })
  @IsString()
  @MaxLength(500)
  text?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(StationKind)
  stationKind?: StationKind | null;

  @ValidateNested()
  @Type(() => StaffFeedbackContextDto)
  context!: StaffFeedbackContextDto;
}
