import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MedicationReconciliationOutcome,
  MedicationSourceType,
  PatientMedicationStatus,
} from '@prisma/client';
import { ToSanitizedString } from '../../common/validation';

export class MedicationSnapshotDto {
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  medicationName!: string;

  @IsOptional()
  @IsUUID()
  drugId?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 100 })
  @MaxLength(100)
  strength?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 100 })
  @MaxLength(100)
  dose?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 80 })
  @MaxLength(80)
  doseUnit?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 100 })
  @MaxLength(100)
  route?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @MaxLength(120)
  frequency?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @MaxLength(120)
  duration?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 300 })
  @MaxLength(300)
  indication?: string;

  @IsEnum(PatientMedicationStatus)
  status!: PatientMedicationStatus;

  @IsOptional()
  @ToSanitizedString({ maxLength: 4000 })
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  sourceEncounterId?: string;

  @IsEnum(MedicationSourceType)
  sourceType!: MedicationSourceType;
}

export class CreatePatientMedicationDto extends MedicationSnapshotDto {
  @IsOptional()
  @IsUUID()
  recordId?: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;
}

export class RevisePatientMedicationDto extends MedicationSnapshotDto {
  @IsUUID()
  expectedCurrentRevisionId!: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;
}

export class ReconciliationItemDto {
  @IsUUID()
  recordId!: string;

  @IsUUID()
  expectedCurrentRevisionId!: string;

  @IsUUID()
  newRevisionId!: string;
}

export class ReconcileMedicationListDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsEnum(MedicationReconciliationOutcome)
  outcome!: MedicationReconciliationOutcome;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReconciliationItemDto)
  items!: ReconciliationItemDto[];

  @IsOptional()
  @IsUUID()
  sourceEncounterId?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 4000 })
  @MaxLength(4000)
  notes?: string;
}

export class PharmacySnapshotDto {
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 200 })
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 200 })
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2 })
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 1000 })
  @MaxLength(1000)
  addressText?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 4000 })
  @MaxLength(4000)
  notes?: string;
}

export class CreatePatientPharmacyDto extends PharmacySnapshotDto {
  @IsOptional()
  @IsUUID()
  recordId?: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;
}

export class RevisePatientPharmacyDto extends PharmacySnapshotDto {
  @IsUUID()
  expectedCurrentRevisionId!: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;
}

export class SetPreferredPharmacyDto {
  @IsOptional()
  @IsUUID()
  preferenceId?: string;

  @IsOptional()
  @IsUUID()
  expectedActivePreferenceId?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 4000 })
  @MaxLength(4000)
  notes?: string;
}

export class EndPreferredPharmacyDto {
  @IsUUID()
  expectedActivePreferenceId!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
