import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ReferralUrgency } from '@prisma/client';
import { IsAllowedEmailDomain } from '../../common/email-policy';
import { ToNormalizedEmail, ToSanitizedString } from '../../common/validation';
import { REFERRAL_REPORT_SECTIONS, type ReferralReportSection } from '../referral-report-sections';

export const REFERRAL_DELIVERY = ['DOWNLOAD', 'EMAIL'] as const;
export type ReferralDelivery = (typeof REFERRAL_DELIVERY)[number];

export class CreateReferralReportDto {
  /** Why the patient is being referred. Printed on the report. */
  @ToSanitizedString({ preserveNewlines: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsIn(Object.values(ReferralUrgency))
  urgency?: ReferralUrgency;

  @ToSanitizedString()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @ToSanitizedString()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientFacility?: string;

  /** Omitted: every section the sender may read, except signed notes. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(REFERRAL_REPORT_SECTIONS, { each: true })
  sections?: ReferralReportSection[];

  @IsIn(REFERRAL_DELIVERY)
  delivery!: ReferralDelivery;

  @ValidateIf((dto: CreateReferralReportDto) => dto.delivery === 'EMAIL')
  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  @MaxLength(320)
  recipientEmail?: string;

  /**
   * The sender's statement that the patient agreed to this referral today. Required only when no
   * referral consent (REFERRAL_SHARING) is on file; the service checks. Audited either way.
   */
  @IsOptional()
  @IsBoolean()
  patientAgreedToday?: boolean;
}
