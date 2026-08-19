import { GhanaRegion, PatientLocationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDistrictInRegion } from '../../common/ghana-location.validator';
import { ToSanitizedString } from '../../common/validation';

/**
 * Residential location fields shared by patient create and update DTOs.
 *
 * All fields are optional at the transport layer; the service enforces the
 * status invariant (RECORDED requires a region; UNKNOWN/NOT_RECORDED clear the
 * granular fields). District membership is validated against its region here.
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
}
