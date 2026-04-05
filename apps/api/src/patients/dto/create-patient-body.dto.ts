import { NationalIdType, Sex } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToNormalizedEmail, ToSanitizedString } from '../../common/validation';

/** Body DTO for POST /clinics/:clinicId/patients; primaryClinicId from route. */
export class CreatePatientBodyDto {
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  firstName!: string;

  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  lastName!: string;

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
  @MaxLength(320)
  email?: string;

  @IsEnum(NationalIdType)
  nationalIdType!: NationalIdType;

  @ToSanitizedString({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  nationalId!: string;
}
