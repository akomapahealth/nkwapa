import { PatientSelfReportType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateSelfReportDto {
  @IsEnum(PatientSelfReportType)
  type!: PatientSelfReportType;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  systolicBp?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(200)
  diastolicBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  glucoseMgDl?: number;

  @IsOptional()
  @IsString()
  glucoseType?: 'FASTING' | 'RANDOM' | 'UNKNOWN';

  @IsOptional()
  @IsString()
  symptomsJson?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  recordedAt?: string; // ISO date string; defaults to now
}
