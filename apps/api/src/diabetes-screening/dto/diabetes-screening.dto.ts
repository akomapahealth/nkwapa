import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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
import { DiabetesSymptom, GlucoseType } from '@prisma/client';
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
  @ArrayMaxSize(5)
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
}
