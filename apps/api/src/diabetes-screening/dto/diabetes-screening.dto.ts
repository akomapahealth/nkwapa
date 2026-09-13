import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  DiabetesClinicianPlanItem,
  DiabetesConcern,
  DiabetesDistressResponse,
  DiabetesReviewReason,
  DiabetesStatus,
  DiabetesSymptom,
  DiabetesType,
  DiabetesUrgentSymptom,
  FollowUpOwner,
  FollowUpWindow,
  GlucoseType,
  Hba1cStatus,
  NkwapaAnswer,
  PhqResponse,
  ScreeningCompletionStatus,
} from '@prisma/client';
import {
  DIABETES_GLUCOSE_MAX_MG_DL,
  DIABETES_GLUCOSE_MIN_MG_DL,
  DIABETES_HBA1C_MAX_PERCENT,
  DIABETES_HBA1C_MIN_PERCENT,
} from '@nkwapa/db';
import { ToSanitizedString } from '../../common/validation';

export class UpsertDiabetesScreeningDto {
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(DIABETES_GLUCOSE_MIN_MG_DL)
  @Max(DIABETES_GLUCOSE_MAX_MG_DL)
  glucoseMgDl!: number | null;

  @IsEnum(GlucoseType)
  glucoseType!: GlucoseType;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(DIABETES_HBA1C_MIN_PERCENT)
  @Max(DIABETES_HBA1C_MAX_PERCENT)
  hba1cPercent!: number | null;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsEnum(DiabetesSymptom, { each: true })
  symptoms!: DiabetesSymptom[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes!: string | null;

  @IsDateString({ strict: true })
  collectedAt!: string;

  // ---------------------------------------------------------------- guided interview (#114)
  //
  // Every field below is optional so a client that has not shipped the interview yet keeps
  // working: its payload is the five original fields, and these default at the database.

  @IsOptional()
  @IsEnum(DiabetesStatus)
  diabetesStatus?: DiabetesStatus;

  @IsOptional()
  @IsEnum(DiabetesType)
  diabetesType?: DiabetesType;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  yearDiagnosed?: number | null;

  @IsOptional()
  @IsBoolean()
  yearDiagnosedUnknown?: boolean;

  @IsOptional()
  @IsEnum(DiabetesConcern)
  mainConcern?: DiabetesConcern;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  mainConcernOther?: string | null;

  @IsOptional()
  @IsEnum(Hba1cStatus)
  hba1cStatus?: Hba1cStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  hba1cMeasuredOn?: string | null;

  @IsOptional()
  @IsEnum(NkwapaAnswer)
  homeGlucoseMonitoring?: NkwapaAnswer;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(DIABETES_GLUCOSE_MIN_MG_DL)
  @Max(DIABETES_GLUCOSE_MAX_MG_DL)
  homeGlucoseLowMgDl?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(DIABETES_GLUCOSE_MIN_MG_DL)
  @Max(DIABETES_GLUCOSE_MAX_MG_DL)
  homeGlucoseHighMgDl?: number | null;

  /**
   * Symptoms happening now, distinct from `symptoms` above, which asks about the past month.
   * The escalation they imply is derived server-side and never accepted from a client.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsEnum(DiabetesUrgentSymptom, { each: true })
  urgentSymptoms?: DiabetesUrgentSymptom[];

  /** Checked by the shared parser in `@nkwapa/db`, not by class-validator. */
  @IsOptional()
  @IsObject()
  nutrition?: Record<string, unknown> | null;

  @IsOptional()
  @IsEnum(PhqResponse)
  phq2Interest?: PhqResponse;

  @IsOptional()
  @IsEnum(PhqResponse)
  phq2Mood?: PhqResponse;

  @IsOptional()
  @IsEnum(DiabetesDistressResponse)
  distressOverwhelmed?: DiabetesDistressResponse;

  @IsOptional()
  @IsEnum(DiabetesDistressResponse)
  distressFailing?: DiabetesDistressResponse;

  @IsOptional()
  @IsEnum(ScreeningCompletionStatus)
  eyeExam?: ScreeningCompletionStatus;

  @IsOptional()
  @IsEnum(ScreeningCompletionStatus)
  footExam?: ScreeningCompletionStatus;

  @IsOptional()
  @IsEnum(ScreeningCompletionStatus)
  kidneyTesting?: ScreeningCompletionStatus;

  @IsOptional()
  @IsEnum(ScreeningCompletionStatus)
  bpCheckedToday?: ScreeningCompletionStatus;

  @IsOptional()
  @IsEnum(NkwapaAnswer)
  currentFootWound?: NkwapaAnswer;

  @IsOptional()
  @IsObject()
  volunteerActions?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  clinicianReviewRequested?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(DiabetesReviewReason, { each: true })
  reviewReasons?: DiabetesReviewReason[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  reviewReasonOther?: string | null;
}

/**
 * The supervising clinician's block, behind `CAREPLAN.CLINICIAN_PLAN`.
 *
 * The clinical specification is explicit that this part shows only for the doctor. A separate DTO
 * on a separate route makes a volunteer sending these keys a request the guard refuses, rather than
 * one whose extra keys are stripped in a branch somebody can later delete.
 */
export class UpsertDiabetesClinicianPlanDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(12)
  @IsEnum(DiabetesClinicianPlanItem, { each: true })
  clinicianPlanItems!: DiabetesClinicianPlanItem[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  clinicianPlanOther!: string | null;

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
