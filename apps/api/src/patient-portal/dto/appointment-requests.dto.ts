import { AppointmentRequestStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

export class CreateAppointmentRequestDto {
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @IsDateString()
  preferredStartDate!: string;

  @IsDateString()
  preferredEndDate!: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  reason?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListAppointmentRequestsQueryDto {
  @IsOptional()
  @IsEnum(AppointmentRequestStatus)
  status?: AppointmentRequestStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ConfirmAppointmentRequestDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsUUID()
  assignedDoctorId?: string;

  @IsOptional()
  @IsUUID()
  assignedVolunteerId?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RejectAppointmentRequestDto {
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
