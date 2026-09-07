import { IsOptional } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';
import { IsZoneFilter } from '../../common/clinic-metadata.validator';

/**
 * Query parameters for `GET /clinics/:clinicId/dashboard`.
 *
 * The dashboard is a per-clinic read, so the only thing a zone can narrow here is the
 * cross-clinic block a system admin sees. Every other section is already scoped to the one
 * clinic in the path and ignores this.
 *
 * Declared even though it holds one optional field, because the global pipe runs with
 * `forbidNonWhitelisted` and would otherwise 400 on the parameter.
 */
export class DashboardQueryDto {
  /** A zone code, or `__unzoned__` for the clinics that have none. */
  @IsOptional()
  @ToSanitizedString()
  @IsZoneFilter()
  zoneCode?: string;
}
