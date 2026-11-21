import { NationalIdType, Sex } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsAllowedEmailDomain } from '../../common/email-policy';
import { ToNormalizedEmail, ToOptionalName, ToSanitizedString } from '../../common/validation';
import { ResidentialLocationDto } from './residential-location.dto';

/** Body DTO for POST /clinics/:clinicId/patients; primaryClinicId from route. */
export class CreatePatientBodyDto extends ResidentialLocationDto {
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  firstName!: string;

  /** Any number of middle names, separated by spaces (#342). */
  @IsOptional()
  @ToOptionalName()
  @IsString()
  @MaxLength(120)
  middleName?: string | null;

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
  @IsAllowedEmailDomain()
  @MaxLength(320)
  email?: string;

  @IsEnum(NationalIdType)
  nationalIdType!: NationalIdType;

  /** Required for every ID type except NONE, where there is no number to give (#214). */
  @ToSanitizedString({ maxLength: 160 })
  @ValidateIf((o: CreatePatientBodyDto) => o.nationalIdType !== NationalIdType.NONE)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nationalId?: string;

  /** A training chart. Only a holder of PATIENT.DEMO.MANAGE may set it. */
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;
}
