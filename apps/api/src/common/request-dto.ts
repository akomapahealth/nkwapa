import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ToCursor, ToOptionalNumber, ToSanitizedString } from './validation';

export class IdParamDto {
  @IsUUID()
  id!: string;
}

export class ClinicIdParamDto {
  @IsUUID()
  clinicId!: string;
}

export class ClinicAndPatientParamsDto extends ClinicIdParamDto {
  @IsUUID()
  patientId!: string;
}

export class ClinicPatientHistoryParamsDto extends ClinicAndPatientParamsDto {
  @IsUUID()
  recordId!: string;
}

export class ClinicAndEncounterParamsDto extends ClinicIdParamDto {
  @IsUUID()
  encounterId!: string;
}

export class ClinicAndEncounterPrescriptionParamsDto extends ClinicAndEncounterParamsDto {
  @IsUUID()
  id!: string;
}

export class ClinicAndDrugParamsDto extends ClinicIdParamDto {
  @IsUUID()
  drugId!: string;
}

export class ClinicAndExportParamsDto extends ClinicIdParamDto {
  @IsUUID()
  exportId!: string;
}

export class ClinicAndRequestParamsDto extends ClinicIdParamDto {
  @IsUUID()
  requestId!: string;
}

export class ClinicAndUserParamsDto extends ClinicIdParamDto {
  @IsUUID()
  userId!: string;
}

export class ClinicAndAssignmentParamsDto extends ClinicIdParamDto {
  @IsUUID()
  assignmentId!: string;
}

export class ClinicAndShiftParamsDto extends ClinicIdParamDto {
  @IsUUID()
  shiftId!: string;
}

export class ClinicAndCheckinParamsDto extends ClinicIdParamDto {
  @IsUUID()
  checkinId!: string;
}

export class ClinicPatientInviteParamsDto extends ClinicAndPatientParamsDto {
  @IsUUID()
  inviteId!: string;
}

export class PatientIdParamDto {
  @IsUUID()
  patientId!: string;
}

export class EncounterIdParamDto {
  @IsUUID()
  encounterId!: string;
}

export class CursorLimitQueryDto {
  @IsOptional()
  @ToCursor()
  @IsString()
  cursor?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchQueryDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  q?: string;
}
