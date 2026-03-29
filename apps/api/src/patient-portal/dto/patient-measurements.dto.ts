import { PatientMeasurementType } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePatientMeasurementDto {
  @IsEnum(PatientMeasurementType)
  type!: PatientMeasurementType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  recordedAt?: string;
}

export class ListPatientMeasurementsQueryDto {
  @IsOptional()
  @IsEnum(PatientMeasurementType)
  type?: PatientMeasurementType;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;
}
