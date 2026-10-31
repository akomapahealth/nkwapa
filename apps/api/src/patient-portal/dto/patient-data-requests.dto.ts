import { PatientDataRequestStatus, PatientDataRequestType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

export class CreatePatientDataRequestDto {
  @IsEnum(PatientDataRequestType)
  type!: PatientDataRequestType;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  details?: string;
}

export class ListPatientDataRequestsQueryDto {
  @IsOptional()
  @IsEnum(PatientDataRequestStatus)
  status?: PatientDataRequestStatus;
}

export class RespondPatientDataRequestDto {
  @IsIn([
    PatientDataRequestStatus.IN_PROGRESS,
    PatientDataRequestStatus.COMPLETED,
    PatientDataRequestStatus.DECLINED,
  ])
  status!: PatientDataRequestStatus;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  responseNote?: string;
}
