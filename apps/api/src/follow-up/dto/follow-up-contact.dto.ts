import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  DiabetesUrgentSymptom,
  FollowUpCancelReason,
  FollowUpClosingStep,
  FollowUpContactMode,
  FollowUpNotReachedReason,
  FollowUpOutcome,
  FollowUpTier,
  HypertensionSymptom,
  MedicationAdherenceLevel,
} from '@prisma/client';
import { BP_DIASTOLIC_MAX, BP_DIASTOLIC_MIN, BP_SYSTOLIC_MAX, BP_SYSTOLIC_MIN } from '@nkwapa/db';
import { ClinicIdParamDto } from '../../common/request-dto';
import { ToSanitizedString } from '../../common/validation';

export const WORKLIST_TABS = ['today', 'overdue', 'week', 'done'] as const;
export type WorklistTab = (typeof WORKLIST_TABS)[number];

export class ClinicAndContactParamsDto extends ClinicIdParamDto {
  @IsUUID()
  contactId!: string;
}

export class ListFollowUpContactsQueryDto {
  @IsIn(WORKLIST_TABS)
  tab!: WorklistTab;

  @IsOptional()
  @IsEnum(FollowUpContactMode)
  mode?: FollowUpContactMode;

  @IsOptional()
  @IsEnum(FollowUpTier)
  tier?: FollowUpTier;

  /** "me", "none" (nobody has taken it), or a user id. */
  @IsOptional()
  @ValidateIf((_, value) => value !== 'me' && value !== 'none')
  @IsUUID()
  owner?: string;

  /** Name or patient code. */
  @IsOptional()
  @ToSanitizedString({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Where the previous page ended; every tab pages. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class TakeFollowUpContactDto {
  /** Omitted to take it yourself; a colleague's id to hand it over. */
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class RecordFollowUpAttemptDto {
  /** Made on the device, so a retried or queued attempt is recorded once. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(FollowUpContactMode)
  mode!: FollowUpContactMode;

  @IsEnum(FollowUpOutcome)
  outcome!: FollowUpOutcome;

  /** Required when the patient was not reached. */
  @ValidateIf((dto: RecordFollowUpAttemptDto) => dto.outcome === 'ATTEMPTED')
  @IsEnum(FollowUpNotReachedReason)
  notReachedReason?: FollowUpNotReachedReason;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsEnum(FollowUpClosingStep, { each: true })
  closingSteps?: FollowUpClosingStep[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(HypertensionSymptom, { each: true })
  symptoms?: HypertensionSymptom[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsEnum(DiabetesUrgentSymptom, { each: true })
  diabetesSymptoms?: DiabetesUrgentSymptom[];

  @IsOptional()
  @IsEnum(MedicationAdherenceLevel)
  adherence?: MedicationAdherenceLevel;

  /** A reading the patient reports. Saved as reported, never as a measured vital. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(BP_SYSTOLIC_MIN)
  @Max(BP_SYSTOLIC_MAX)
  reportedSystolicBp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(BP_DIASTOLIC_MIN)
  @Max(BP_DIASTOLIC_MAX)
  reportedDiastolicBp?: number;

  @IsOptional()
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  referralDestination?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** The next contact's date, when the person agreed a different one with the patient. */
  @IsOptional()
  @IsISO8601({ strict: true })
  nextContactOn?: string;
}

export class CancelFollowUpContactDto {
  @IsEnum(FollowUpCancelReason)
  reason!: FollowUpCancelReason;
}

/**
 * A follow-up attempt recorded offline and replayed by the outbox (#338). The attempt's id is the
 * mutation's `entityId`, so a payload cannot name a different record from its idempotency record.
 */
export class FollowUpAttemptReplayPayload extends RecordFollowUpAttemptDto {
  @Equals(1)
  schemaVersion!: 1;

  @IsUUID()
  contactId!: string;

  /** When the call happened on the device. */
  @IsISO8601({ strict: true })
  occurredAt!: string;
}
