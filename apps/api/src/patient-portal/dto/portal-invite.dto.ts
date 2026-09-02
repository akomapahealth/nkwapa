import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsAllowedEmailDomain } from '../../common/email-policy';
import { SELECTABLE_PORTAL_INVITE_TTL_DAYS } from '../../common/portal-invite-lifecycle';
import { ToNormalizedEmail, ToSanitizedString } from '../../common/validation';

export class CreatePatientPortalInviteDto {
  @IsOptional()
  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  phoneE164?: string;

  /**
   * An exact instant. Kept for API compatibility and for any caller that has one; it wins
   * over `ttlDays`. The chart sends `ttlDays` instead, because staff choose a lifetime,
   * not a timestamp.
   */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /**
   * How long the invite stays claimable, in days.
   *
   * Constrained to the values the chart offers rather than left free: an invite that
   * outlives its usefulness is the failure this whole lifecycle exists to stop, and a
   * free-form number is how a six-month invite gets issued by accident. Omitting it takes
   * the deployment default.
   */
  @IsOptional()
  @Type(() => Number)
  @IsIn([...SELECTABLE_PORTAL_INVITE_TTL_DAYS])
  ttlDays?: number;
}
