import { PatientMeasurementType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

export class CreatePatientMeasurementDto {
  @IsEnum(PatientMeasurementType)
  type!: PatientMeasurementType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class ListPatientMeasurementsQueryDto {
  @IsOptional()
  @IsEnum(PatientMeasurementType)
  type?: PatientMeasurementType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;
}
