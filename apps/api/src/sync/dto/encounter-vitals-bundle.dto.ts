import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BloodPressureCuffSize,
  BloodPressureSite,
  PatientPosition,
  ReadinessToQuit,
  ScreeningAnswer,
  TemperatureSource,
  TobaccoUseStatus,
} from '@prisma/client';
import { ToOptionalNumber, ToSanitizedString } from '../../common/validation';

export const TEMPERATURE_UNITS = ['CELSIUS', 'FAHRENHEIT'] as const;
export type TemperatureInputUnit = (typeof TEMPERATURE_UNITS)[number];

export class VitalsInputDto {
  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(40)
  @Max(300)
  systolicBp?: number | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp?: number | null;

  @IsOptional()
  @IsEnum(BloodPressureSite)
  bpSite?: BloodPressureSite | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  bpSiteOther?: string | null;

  @IsOptional()
  @IsEnum(PatientPosition)
  patientPosition?: PatientPosition | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  patientPositionOther?: string | null;

  @IsOptional()
  @IsEnum(BloodPressureCuffSize)
  cuffSize?: BloodPressureCuffSize | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  cuffSizeOther?: string | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(20)
  @Max(300)
  pulseBpm?: number | null;

  /** @deprecated Compatibility alias for pulseBpm. */
  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(20)
  @Max(300)
  heartRate?: number | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  temperatureValue?: number | null;

  @IsOptional()
  @IsIn(TEMPERATURE_UNITS)
  temperatureUnit?: TemperatureInputUnit | null;

  @IsOptional()
  @IsEnum(TemperatureSource)
  temperatureSource?: TemperatureSource | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  temperatureSourceOther?: string | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  respiratoryRate?: number | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  spo2Percent?: number | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(700)
  weightKg?: number | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(20)
  @Max(300)
  heightCm?: number | null;

  /** @deprecated Accepted but ignored; BMI is always derived by the server. */
  @IsOptional()
  @ToOptionalNumber()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  bmi?: number | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class TobaccoScreeningInputDto {
  @IsEnum(TobaccoUseStatus)
  smokingStatus: TobaccoUseStatus = TobaccoUseStatus.NOT_ASSESSED;

  @IsEnum(TobaccoUseStatus)
  smokelessTobaccoStatus: TobaccoUseStatus = TobaccoUseStatus.NOT_ASSESSED;

  @IsEnum(ScreeningAnswer)
  passiveExposure: ScreeningAnswer = ScreeningAnswer.NOT_ASSESSED;

  @IsEnum(ReadinessToQuit)
  readinessToQuit: ReadinessToQuit = ReadinessToQuit.NOT_ASSESSED;

  @IsEnum(ScreeningAnswer)
  counselingGiven: ScreeningAnswer = ScreeningAnswer.NOT_ASSESSED;
}

export class EncounterVitalsBundleDto {
  @IsIn([1])
  schemaVersion!: 1;

  @IsUUID()
  encounterId!: string;

  @IsUUID()
  vitalsId!: string;

  @IsOptional()
  @IsUUID()
  tobaccoScreeningId?: string;

  @ValidateNested()
  @Type(() => VitalsInputDto)
  vitals!: VitalsInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TobaccoScreeningInputDto)
  tobacco?: TobaccoScreeningInputDto;

  @IsOptional()
  @IsBoolean()
  markTobaccoReviewed?: boolean;
}
