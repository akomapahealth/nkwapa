import { GhanaRegion, PatientLocationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PATIENT_REGISTRY_SORT_FIELDS, type PatientRegistrySortField } from '../patient.repository';
import { ToCursor, ToOptionalNumber, ToSanitizedString } from '../../common/validation';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListPatientRegistryQueryDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  q?: string;

  @IsOptional()
  @IsEnum(GhanaRegion)
  residentialRegion?: GhanaRegion;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  residentialDistrict?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  residentialCommunity?: string;

  @IsOptional()
  @IsEnum(PatientLocationStatus)
  residentialLocationStatus?: PatientLocationStatus;

  /** First clinic-local day a completed screening may fall on. Alone, it means that one day. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'screenedFrom must be YYYY-MM-DD' })
  screenedFrom?: string;

  /** Last clinic-local day, inclusive. Requires `screenedFrom`. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'screenedTo must be YYYY-MM-DD' })
  screenedTo?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn([...PATIENT_REGISTRY_SORT_FIELDS])
  sortBy?: PatientRegistrySortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @ToCursor()
  cursor?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
