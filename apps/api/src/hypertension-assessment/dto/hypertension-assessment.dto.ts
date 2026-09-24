import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  BloodPressureCuffSize,
  BpAffectingSubstance,
  BpRepeatStatus,
  CardiometabolicCondition,
  FacilityKnownStatus,
  FollowUpOwner,
  FollowUpWindow,
  HomeBpCheckFrequency,
  HomeBpMonitorStatus,
  HomeBpSource,
  HypertensionClassification,
  HypertensionClinicianPlanItem,
  HypertensionConcern,
  HypertensionReviewReason,
  HypertensionStatus,
  HypertensionSymptom,
  MedicationReminderStrategy,
  MedicationUseStatus,
  NkwapaAnswer,
  PatientPosition,
  PregnancyPlanningAnswer,
  ScreeningCompletionStatus,
} from '@prisma/client';
import { BP_DIASTOLIC_MAX, BP_DIASTOLIC_MIN, BP_SYSTOLIC_MAX, BP_SYSTOLIC_MIN } from '@nkwapa/db';
import { ToSanitizedString } from '../../common/validation';

/**
 * Bounds shared with the database CHECK constraints in
 * `20260913090000_expand_hypertension_assessment` and with the encounter form, which imports the
 * same constants from `@nkwapa/db`. Every layer enforces them, because a boundary that depends on
 * one layer is one refactor from not being a boundary.
 */
export { BP_DIASTOLIC_MAX, BP_DIASTOLIC_MIN, BP_SYSTOLIC_MAX, BP_SYSTOLIC_MIN } from '@nkwapa/db';
export const YEAR_DIAGNOSED_MIN = 1900;
const SHORT_TEXT = 200;

/**
 * The volunteer-writable half of the hypertension interview.
 *
 * Deliberately excludes every clinician-plan field. Those live in
 * `UpsertHypertensionClinicianPlanDto`, behind `CAREPLAN.CLINICIAN_PLAN`, so a volunteer's payload
 * cannot carry them at all -- `forbidNonWhitelisted` rejects the request rather than quietly
 * dropping the keys. Splitting the DTOs makes that boundary a type rather than an `if`.
 *
 * Derived columns are absent for the same reason. `derivedClassification`, `urgentReviewRequired`
 * and `urgentReviewReasons` are computed by the service from the encounter's vitals and this
 * payload's symptoms; accepting them from a client would let a device decide whether a patient
 * needs a clinician.
 */
export class UpsertHypertensionAssessmentDto {
  // 1. History
  @IsEnum(HypertensionStatus)
  hypertensionStatus!: HypertensionStatus;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(YEAR_DIAGNOSED_MIN)
  yearDiagnosed!: number | null;

  @IsBoolean()
  yearDiagnosedUnknown!: boolean;

  @IsEnum(HypertensionConcern)
  mainConcern!: HypertensionConcern;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: SHORT_TEXT })
  @IsString()
  @MaxLength(SHORT_TEXT)
  mainConcernOther!: string | null;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: SHORT_TEXT })
  @IsString()
  @MaxLength(SHORT_TEXT)
  usualCareFacility!: string | null;

  @IsEnum(FacilityKnownStatus)
  usualCareFacilityStatus!: FacilityKnownStatus;

  // 2. Blood-pressure control. Today's reading is not accepted here at all: it is read from the
  // encounter's Vitals row, so one encounter cannot hold two disagreeing answers to "what was the
  // blood pressure today".
  @IsEnum(BpRepeatStatus)
  repeatPerformed!: BpRepeatStatus;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(BP_SYSTOLIC_MIN)
  @Max(BP_SYSTOLIC_MAX)
  repeatSystolicBp!: number | null;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(BP_DIASTOLIC_MIN)
  @Max(BP_DIASTOLIC_MAX)
  repeatDiastolicBp!: number | null;

  @IsOptional()
  @IsEnum(PatientPosition)
  repeatPosition?: PatientPosition | null;

  @IsOptional()
  @IsEnum(BloodPressureCuffSize)
  repeatCuffSize?: BloodPressureCuffSize | null;

  @IsOptional()
  @IsDateString({ strict: true })
  repeatMeasuredAt?: string | null;

  @IsBoolean()
  repeatPromptShown!: boolean;

  @IsEnum(HomeBpMonitorStatus)
  homeMonitorStatus!: HomeBpMonitorStatus;

  @IsEnum(HomeBpCheckFrequency)
  homeCheckFrequency!: HomeBpCheckFrequency;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(BP_SYSTOLIC_MIN)
  @Max(BP_SYSTOLIC_MAX)
  homeSystolicAvg!: number | null;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(BP_DIASTOLIC_MIN)
  @Max(BP_DIASTOLIC_MAX)
  homeDiastolicAvg!: number | null;

  @IsBoolean()
  homeReadingsUnknown!: boolean;

  @IsEnum(HomeBpSource)
  homeReadingSource!: HomeBpSource;

  // 3. Symptoms. The escalation they imply is derived server-side, never accepted.
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(HypertensionSymptom, { each: true })
  currentSymptoms!: HypertensionSymptom[];

  // 4. Adherence support. The medications themselves are the reconciled patient list.
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsEnum(MedicationReminderStrategy, { each: true })
  medicationReminderStrategies!: MedicationReminderStrategy[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: SHORT_TEXT })
  @IsString()
  @MaxLength(SHORT_TEXT)
  reminderStrategyOther!: string | null;

  // 5. Possible contributors.
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsEnum(BpAffectingSubstance, { each: true })
  contributingSubstances!: BpAffectingSubstance[];

  /**
   * JSONB sections arrive as opaque objects here and are checked by the shared parsers in
   * `@nkwapa/db`, not by class-validator. `@IsObject` only rejects the shapes the database CHECK
   * would also reject; the service runs `parseHypertensionSubstanceDetails` and
   * `parseHypertensionLifestyle` and turns their issue lists into field errors, so the API and the
   * web form reject exactly the same payloads for exactly the same reasons.
   */
  @IsOptional()
  @IsObject()
  substanceDetails?: Record<string, unknown> | null;

  // 6. Nutrition, activity and alcohol.
  @IsOptional()
  @IsObject()
  lifestyle?: Record<string, unknown> | null;

  // 7. Relevant history.
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(CardiometabolicCondition, { each: true })
  relevantConditions!: CardiometabolicCondition[];

  @IsEnum(NkwapaAnswer)
  pregnantNow!: NkwapaAnswer;

  @IsEnum(PregnancyPlanningAnswer)
  planningPregnancy!: PregnancyPlanningAnswer;

  // 8. Screening status.
  @IsEnum(ScreeningCompletionStatus)
  kidneyFunctionTesting!: ScreeningCompletionStatus;

  @IsEnum(ScreeningCompletionStatus)
  urineProteinTesting!: ScreeningCompletionStatus;

  @IsEnum(ScreeningCompletionStatus)
  cholesterolTesting!: ScreeningCompletionStatus;

  @IsEnum(ScreeningCompletionStatus)
  ecgCompleted!: ScreeningCompletionStatus;

  /*
    Optional even when the status is COMPLETED. "Sometime last year" is a real answer, and
    requiring a date would invite an invented one. Null means "not recorded", never "not done":
    the status field beside it is the only thing that says whether the screening happened.
  */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  kidneyFunctionTestingCompletedOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  urineProteinTestingCompletedOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  cholesterolTestingCompletedOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  ecgCompletedOn?: string | null;

  @IsEnum(MedicationUseStatus)
  statinUse!: MedicationUseStatus;

  @IsEnum(MedicationUseStatus)
  aspirinUse!: MedicationUseStatus;

  // Guided plan -- volunteer.
  @IsOptional()
  @IsObject()
  volunteerActions?: Record<string, unknown> | null;

  @IsBoolean()
  clinicianReviewRequested!: boolean;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(HypertensionReviewReason, { each: true })
  reviewReasons!: HypertensionReviewReason[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: SHORT_TEXT })
  @IsString()
  @MaxLength(SHORT_TEXT)
  reviewReasonOther!: string | null;

  /**
   * A clinician's manual classification.
   *
   * Honoured only when `classificationOverridden` is true; otherwise the server's derivation wins.
   * Before this module existed, `sync.service.ts` cast `payload.classification` straight to the
   * enum with no validation at all, so `{ classification: 'BOGUS' }` reached Prisma.
   */
  @IsOptional()
  @IsEnum(HypertensionClassification)
  classification?: HypertensionClassification;

  @IsBoolean()
  classificationOverridden!: boolean;

  @IsBoolean()
  suspected!: boolean;

  @IsBoolean()
  confirmed!: boolean;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes!: string | null;

  @IsDateString({ strict: true })
  collectedAt!: string;
}

/**
 * The supervising clinician's block, behind `CAREPLAN.CLINICIAN_PLAN`.
 *
 * A separate DTO on a separate route rather than optional fields on the one above. A volunteer
 * sending these keys is a request that should fail, not one whose extra keys get stripped in a
 * branch somebody can later delete.
 */
export class UpsertHypertensionClinicianPlanDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(14)
  @IsEnum(HypertensionClinicianPlanItem, { each: true })
  clinicianPlanItems!: HypertensionClinicianPlanItem[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: SHORT_TEXT })
  @IsString()
  @MaxLength(SHORT_TEXT)
  clinicianPlanOther!: string | null;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(BP_SYSTOLIC_MIN)
  @Max(BP_SYSTOLIC_MAX)
  bpGoalSystolic!: number | null;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(BP_DIASTOLIC_MIN)
  @Max(BP_DIASTOLIC_MAX)
  bpGoalDiastolic!: number | null;

  @IsEnum(FollowUpWindow)
  followUpWindow!: FollowUpWindow;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  followUpOther!: string | null;

  @IsEnum(FollowUpOwner)
  followUpOwner!: FollowUpOwner;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  clinicianComments!: string | null;
}
