import { Sex } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsAllowedEmailDomain } from '../../common/email-policy';
import { ToNormalizedEmail, ToSanitizedString } from '../../common/validation';
import { ResidentialLocationDto } from './residential-location.dto';

/** Body DTO for PATCH /clinics/:clinicId/patients/:patientId. National ID is immutable. */
export class UpdatePatientBodyDto extends ResidentialLocationDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  phoneE164?: string;

  @IsOptional()
  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  @MaxLength(320)
  email?: string;
}
