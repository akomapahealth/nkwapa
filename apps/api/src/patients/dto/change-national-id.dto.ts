import { NationalIdType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

/** Body DTO for PATCH /clinics/:clinicId/patients/:patientId/national-id (#214). */
export class ChangeNationalIdBodyDto {
  @IsEnum(NationalIdType)
  nationalIdType!: NationalIdType;

  /** Required for every ID type except NONE; the service refuses a number sent with NONE. */
  @ToSanitizedString({ maxLength: 160 })
  @ValidateIf((o: ChangeNationalIdBodyDto) => o.nationalIdType !== NationalIdType.NONE)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nationalId?: string;

  /** Why the ID changed ("brought their Ghana Card", "typo at registration"); kept in the audit. */
  @ToSanitizedString({ maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
