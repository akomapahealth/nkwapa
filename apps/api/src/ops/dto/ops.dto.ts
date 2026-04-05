import { AssignmentStatus, CheckInSource, CheckInStatus, ShiftRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ShiftCheckInDto {
  @IsEnum(ShiftRole)
  roleAtShift!: ShiftRole;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ActiveShiftsQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

export class CreatePatientCheckInDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsEnum(CheckInSource)
  source?: CheckInSource;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListCheckInsQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsEnum(CheckInStatus)
  status?: CheckInStatus;
}

export class CreateAssignmentDto {
  @IsUUID()
  patientCheckInId!: string;

  @IsUUID()
  assignedVolunteerId!: string;

  @IsUUID()
  assignedDoctorId!: string;
}

export class ReassignAssignmentDto {
  @IsUUID()
  assignedVolunteerId!: string;

  @IsUUID()
  assignedDoctorId!: string;

  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class ListAssignmentsQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;
}

export class ListMyAssignmentsQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}
