import { ConsentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

/** Body DTO for POST /clinics/:clinicId/patients/:patientId/consents */
export class CreateConsentDto {
  @IsEnum(ConsentType)
  consentType!: ConsentType;

  @ToSanitizedString({ maxLength: 5000, preserveNewlines: true })
  @IsString()
  @MaxLength(5000)
  consentTextSnapshot!: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  consentVersion?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  witnessName?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  witnessPhoneE164?: string;
}

export class RevokeConsentDto {
  @IsOptional()
  @IsEnum(ConsentType)
  consentType?: ConsentType;
}
