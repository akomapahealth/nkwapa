import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Eye, EyeFindingResult, EyeStructure, VisionLossCause } from '@prisma/client';
import {
  CUP_DISC_RATIO_MAX,
  CUP_DISC_RATIO_MIN,
  EYE_STRUCTURES,
  EYES,
  VISUAL_ACUITY_VALUES,
  type VisualAcuity,
} from '@nkwapa/db';
import { ToSanitizedString } from '../../common/validation';

/** One acuity reading, or null when it was not taken. */
function Acuity() {
  return (target: object, key: string) => {
    IsOptional()(target, key);
    ValidateIf((_, value) => value !== null)(target, key);
    IsIn(VISUAL_ACUITY_VALUES as unknown as string[], {
      message: `${key} must be a Snellen value at 6 m (6/5 to 6/60) or CF, HM, PL, NPL`,
    })(target, key);
  };
}

function CupDiscRatio() {
  return (target: object, key: string) => {
    IsOptional()(target, key);
    ValidateIf((_, value) => value !== null)(target, key);
    IsNumber({ maxDecimalPlaces: 2 })(target, key);
    Min(CUP_DISC_RATIO_MIN)(target, key);
    Max(CUP_DISC_RATIO_MAX)(target, key);
  };
}

export class EyeExamFindingDto {
  @IsEnum(Eye)
  eye!: Eye;

  @IsEnum(EyeStructure)
  structure!: EyeStructure;

  @IsEnum(EyeFindingResult)
  result!: EyeFindingResult;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class UpsertEyeScreeningDto {
  /** The version the editor started from. Required to change an existing record. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsBoolean()
  hasEyeComplaint!: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  complaintHistory?: string | null;

  @IsBoolean()
  wearsCorrection!: boolean;

  @Acuity() vaOdUnaided?: VisualAcuity | null;
  @Acuity() vaOsUnaided?: VisualAcuity | null;
  @Acuity() vaOuUnaided?: VisualAcuity | null;
  @Acuity() vaOdAided?: VisualAcuity | null;
  @Acuity() vaOsAided?: VisualAcuity | null;
  @Acuity() vaOuAided?: VisualAcuity | null;
  @Acuity() vaOdPinhole?: VisualAcuity | null;
  @Acuity() vaOsPinhole?: VisualAcuity | null;

  @CupDiscRatio() cupDiscRatioOd?: number | null;
  @CupDiscRatio() cupDiscRatioOs?: number | null;

  @IsArray()
  @ArrayMaxSize(EYES.length * EYE_STRUCTURES.length)
  @ValidateNested({ each: true })
  @Type(() => EyeExamFindingDto)
  findings!: EyeExamFindingDto[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(VisionLossCause)
  visionLossCause?: VisionLossCause | null;

  @IsBoolean()
  diabeticSignsSeen!: boolean;

  @IsBoolean()
  hypertensiveSignsSeen!: boolean;

  @IsBoolean()
  referralRecommended!: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  referralNote?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 5000, preserveNewlines: true })
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}
