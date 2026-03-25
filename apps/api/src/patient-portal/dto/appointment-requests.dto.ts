import { AppointmentRequestStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentRequestDto {
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @IsString()
  preferredStartDate!: string;

  @IsString()
  preferredEndDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListAppointmentRequestsQueryDto {
  @IsOptional()
  @IsEnum(AppointmentRequestStatus)
  status?: AppointmentRequestStatus;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class ConfirmAppointmentRequestDto {
  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;

  @IsOptional()
  @IsUUID()
  assignedDoctorId?: string;

  @IsOptional()
  @IsUUID()
  assignedVolunteerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RejectAppointmentRequestDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
