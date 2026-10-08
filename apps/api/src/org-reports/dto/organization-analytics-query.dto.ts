import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { AppointmentStatus, EncounterStatus } from '@prisma/client';
import { ToSanitizedString } from '../../common/validation';
import { IsZoneFilter } from '../../common/clinic-metadata.validator';
import { ANALYTICS_WORKFLOWS, type AnalyticsWorkflow } from '../organization-analytics.aggregate';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cohort filters for `GET /organizations/:organizationId/analytics`. Every one is optional.
 *
 * Dates are calendar days in the organization's time zone, both ends included. The service
 * checks what the shape cannot: that the dates exist, run forwards, and fit the maximum range.
 */
export class OrganizationAnalyticsQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY_RE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY_RE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  /** Narrow to one clinic. It must belong to the organization in the path. */
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  /** A zone code, or `__unzoned__` for the clinics that have none. */
  @IsOptional()
  @ToSanitizedString()
  @IsZoneFilter()
  zoneCode?: string;

  @IsOptional()
  @IsIn(ANALYTICS_WORKFLOWS)
  workflow?: AnalyticsWorkflow;

  @IsOptional()
  @IsEnum(EncounterStatus)
  encounterStatus?: EncounterStatus;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  appointmentStatus?: AppointmentStatus;
}
