import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StationKind } from '@prisma/client';
import { ToSanitizedString } from '../../common/validation';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class StationDayQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

/** Why a stop ended without the station's work. Required wherever a person cuts the line short. */
export class StationReasonDto {
  @ToSanitizedString({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class StationSkipDto {
  @IsUUID()
  stationId!: string;

  @ToSanitizedString({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class CompleteStationVisitDto {
  /** What the next station should know. */
  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  handoffNote?: string;

  /** Send the patient somewhere other than the next station in order. */
  @IsOptional()
  @IsUUID()
  nextStationId?: string;

  /** Stations passed over on the way, each with its reason (e.g. "out of glucose strips"). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => StationSkipDto)
  skips?: StationSkipDto[];
}

export class SetShiftStationDto {
  /** Null clears it. */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  stationId!: string | null;
}

export class MoveCheckInDto extends StationReasonDto {
  @IsUUID()
  stationId!: string;
}

export class CreateStationDto {
  @IsEnum(StationKind)
  kind!: StationKind;

  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class UpdateStationDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReorderStationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  stationIds!: string[];
}
