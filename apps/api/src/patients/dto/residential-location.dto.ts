import { GHANA_BOUNDS, normalizeDigitalAddress } from '@nkwapa/db';
import { GhanaRegion, PatientLocationStatus, ResidentialPositionSource } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDigitalAddress, IsDistrictInRegion } from '../../common/ghana-location.validator';
import { ToSanitizedString } from '../../common/validation';

/**
 * Residential location fields shared by patient create and update DTOs.
 *
 * All fields are optional at the transport layer; the service enforces the
 * status invariant (RECORDED requires a region; UNKNOWN/NOT_RECORDED clear the
 * granular fields). District membership is validated against its region here.
 * Latitude and longitude must come as a pair; the service enforces that, since the offline sync
 * path skips this DTO.
 */
export class ResidentialLocationDto {
  @IsOptional()
  @IsEnum(PatientLocationStatus)
  residentialLocationStatus?: PatientLocationStatus;

  @IsOptional()
  @IsEnum(GhanaRegion)
  residentialRegion?: GhanaRegion;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  @IsDistrictInRegion()
  residentialDistrict?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  residentialCommunity?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 280, preserveNewlines: true })
  @IsString()
  @MaxLength(280)
  residentialAddressNote?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (normalizeDigitalAddress(value) ?? value.trim()) : value,
  )
  @IsString()
  @IsDigitalAddress()
  residentialDigitalAddress?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  residentialLandmark?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(GHANA_BOUNDS.minLat, { message: 'That position is outside Ghana.' })
  @Max(GHANA_BOUNDS.maxLat, { message: 'That position is outside Ghana.' })
  residentialLatitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(GHANA_BOUNDS.minLng, { message: 'That position is outside Ghana.' })
  @Max(GHANA_BOUNDS.maxLng, { message: 'That position is outside Ghana.' })
  residentialLongitude?: number;

  @IsOptional()
  @IsEnum(ResidentialPositionSource)
  residentialPositionSource?: ResidentialPositionSource;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  residentialPositionAccuracyM?: number;

  @IsOptional()
  @IsDateString()
  residentialPositionCapturedAt?: string;
}
