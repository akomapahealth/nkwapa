import { IsOptional } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';
import { IsZoneFilter } from '../../common/clinic-metadata.validator';

/**
 * Query parameters for `GET /admin/clinics`.
 *
 * This class has to exist even though it holds one optional field: the global pipe runs with
 * `forbidNonWhitelisted`, so a query parameter no DTO declares is a 400 rather than something
 * quietly ignored.
 *
 * Zone is the only filter here, and it narrows. The controller resolves which clinics the actor
 * may see before this value is applied, so a zone the actor does not administer simply matches
 * nothing rather than reaching across a tenant boundary.
 */
export class ListClinicsAdminQueryDto {
  /**
   * A zone code, or `__unzoned__` for the clinics that have none.
   *
   * The sentinel is sanitized-but-not-normalized on purpose: `normalizeZoneCode` would be the
   * obvious transform, but it is the column's rule and would reject the sentinel. The shared
   * `parseZoneFilter` does the normalizing, once, where the filter is actually resolved.
   *
   * Deliberately not capped at `ZONE_CODE_MAX_LENGTH` here. The sanitizer truncates rather than
   * refuses, so capping would turn an over-long code into a valid 64-character one and answer a
   * question nobody asked. The validator refuses it instead.
   */
  @IsOptional()
  @ToSanitizedString()
  @IsZoneFilter()
  zoneCode?: string;
}
