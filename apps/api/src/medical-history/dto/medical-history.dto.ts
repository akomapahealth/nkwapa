import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MedicalHistoryCategory, MedicalHistoryStatus } from '@prisma/client';
import { ToSanitizedString } from '../../common/validation';

export const ALLERGY_KINDS = ['ALLERGY', 'NO_KNOWN_ALLERGIES'] as const;
export const ALLERGY_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN'] as const;
export const SOCIAL_HISTORY_TYPES = [
  'TOBACCO',
  'ALCOHOL',
  'SUBSTANCE_USE',
  'OCCUPATION',
  'LIVING_SITUATION',
  'OTHER',
] as const;

export class MedicalHistoryDetailsDto {
  @IsOptional()
  @IsIn(ALLERGY_KINDS)
  kind?: (typeof ALLERGY_KINDS)[number];

  @IsOptional()
  @ToSanitizedString({ maxLength: 240 })
  @IsString()
  @MaxLength(240)
  conditionName?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 240 })
  @IsString()
  @MaxLength(240)
  substance?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reaction?: string;

  @IsOptional()
  @IsIn(ALLERGY_SEVERITIES)
  severity?: (typeof ALLERGY_SEVERITIES)[number];

  @IsOptional()
  @ToSanitizedString({ maxLength: 240 })
  @IsString()
  @MaxLength(240)
  procedureName?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  relationship?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 240 })
  @IsString()
  @MaxLength(240)
  familyCondition?: string;

  @IsOptional()
  @IsIn(SOCIAL_HISTORY_TYPES)
  socialType?: (typeof SOCIAL_HISTORY_TYPES)[number];

  @IsOptional()
  @ToSanitizedString({ maxLength: 1000, preserveNewlines: true })
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class MedicalHistorySnapshotDto {
  @IsEnum(MedicalHistoryStatus)
  status!: MedicalHistoryStatus;

  @IsOptional()
  @IsDateString()
  onsetDate?: string;

  @IsOptional()
  @IsDateString()
  occurrenceDate?: string;

  @IsOptional()
  @IsDateString()
  resolvedDate?: string;

  @ValidateNested()
  @Type(() => MedicalHistoryDetailsDto)
  @IsObject()
  details!: MedicalHistoryDetailsDto;

  @IsOptional()
  @ToSanitizedString({ maxLength: 4000, preserveNewlines: true })
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  sourceEncounterId?: string;
}

export class CreateMedicalHistoryDto extends MedicalHistorySnapshotDto {
  @IsEnum(MedicalHistoryCategory)
  category!: MedicalHistoryCategory;

  @IsOptional()
  @IsUUID()
  recordId?: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;
}

export class ReviseMedicalHistoryDto extends MedicalHistorySnapshotDto {
  @IsUUID()
  expectedCurrentRevisionId!: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;
}

export class ListMedicalHistoryQueryDto {
  @IsOptional()
  @IsEnum(MedicalHistoryCategory)
  category?: MedicalHistoryCategory;

  @IsOptional()
  @IsEnum(MedicalHistoryStatus)
  status?: MedicalHistoryStatus;
}
