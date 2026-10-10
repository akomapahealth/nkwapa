import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TIMEZONE_MAX_LENGTH, normalizeCountryCode, normalizeZoneCode } from '@nkwapa/db';
import { ToSanitizedString } from '../../common/validation';
import { IsCountryCode, IsIanaTimeZone, IsZoneCode } from '../../common/clinic-metadata.validator';

/**
 * The location and zone metadata every clinic write shares.
 *
 * Create and update extend this rather than repeating it, in the same way the patient bodies
 * extend `ResidentialLocationDto`. `locationCode` deliberately lives on the subclasses: it is
 * required on create and optional on update, and that is the only difference between them.
 *
 * Values are normalized before they are validated, so `"gh"` and `" Greater-Accra "` are
 * accepted and stored in the one form the rest of the product reads.
 */
export class ClinicMetadataDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: TIMEZONE_MAX_LENGTH })
  @IsIanaTimeZone()
  timezone?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeCountryCode(value))
  @IsCountryCode()
  countryCode?: string;

  /**
   * `null` clears the zone. The transform collapses `''` and whitespace to `null` too, so an
   * empty form field and an explicit clear reach the service as the same thing.
   */
  @IsOptional()
  @Transform(({ value }) => normalizeZoneCode(value))
  @IsZoneCode()
  zoneCode?: string | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  region?: string;
}
