import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToNormalizedEmail, ToSanitizedString } from '../../common/validation';

export class CreatePatientPortalInviteDto {
  @IsOptional()
  @ToNormalizedEmail()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  phoneE164?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
