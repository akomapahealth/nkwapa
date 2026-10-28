import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsAllowedEmailDomain } from '../../common/email-policy';
import { ToNormalizedEmail, ToOptionalBoolean, ToSanitizedString } from '../../common/validation';
import { ClinicIdParamDto } from '../../common/request-dto';

const E164 = /^\+[1-9]\d{6,14}$/;

export class VolunteerParamsDto extends ClinicIdParamDto {
  @IsUUID()
  id!: string;
}

export class EventParamsDto extends ClinicIdParamDto {
  @IsUUID()
  eventId!: string;
}

export class AssignmentParamsDto extends EventParamsDto {
  @IsUUID()
  assignmentId!: string;
}

export class CreateVolunteerDto {
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string;

  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @Matches(E164, { message: 'phoneE164 must be an international number such as +233201234567' })
  phoneE164?: string | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 500, preserveNewlines: true })
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateVolunteerDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @Matches(E164, { message: 'phoneE164 must be an international number such as +233201234567' })
  phoneE164?: string | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 500, preserveNewlines: true })
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class LinkVolunteerDto {
  @IsUUID()
  userId!: string;
}

export class CreateScreeningEventDto {
  @ToSanitizedString({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  /** An instant; the web converts the clinic-local time the manager typed. */
  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @ToSanitizedString({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  siteName!: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  siteAddress?: string | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 1000, preserveNewlines: true })
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateScreeningEventDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  siteName?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  siteAddress?: string | null;

  @IsOptional()
  @ToSanitizedString({ maxLength: 1000, preserveNewlines: true })
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  /** Email volunteers already told about this event when its date, time or site changes. */
  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  notifyChange?: boolean;
}

export class CancelScreeningEventDto {
  @ToSanitizedString({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  notifyVolunteers?: boolean;
}

export class AddToRosterDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  volunteerContactIds!: string[];
}

export class RemoveFromRosterQueryDto {
  /** Email them that they are no longer scheduled. Off unless asked for. */
  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  notify?: boolean;
}
