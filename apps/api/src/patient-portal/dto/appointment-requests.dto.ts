import { AppointmentRequestStatus, AppointmentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export class ListAppointmentsQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID()
  assignedDoctorId?: string;

  @IsOptional()
  @IsUUID()
  assignedVolunteerId?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  patientSearch?: string;
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

export class RescheduleAppointmentDto {
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

export class CancelAppointmentDto {
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class CompleteAppointmentDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class MarkNoShowAppointmentDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
