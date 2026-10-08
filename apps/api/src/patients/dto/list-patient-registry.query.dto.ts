import { GhanaRegion, PatientLocationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PATIENT_REGISTRY_SORT_FIELDS, type PatientRegistrySortField } from '../patient.repository';
import { ToCursor, ToOptionalNumber, ToSanitizedString } from '../../common/validation';

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
