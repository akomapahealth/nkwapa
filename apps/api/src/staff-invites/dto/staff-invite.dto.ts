import { IsBoolean, IsEmail, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { IsAllowedEmailDomain } from '../../common/email-policy';
import { SELECTABLE_STAFF_INVITE_TTL_HOURS } from '../../common/staff-invite-lifecycle';
import { ToNormalizedEmail, ToOptionalBoolean } from '../../common/validation';
import { ClinicIdParamDto } from '../../common/request-dto';
import {
  IsMiddleInitial,
  IsStaffNamePart,
  ToMiddleInitial,
  ToStaffNamePart,
} from '../../common/staff-name.validation';

export class CreateStaffInviteDto {
  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  @MaxLength(320)
  email!: string;

  /**
   * Validated against every role, not only the invitable ones, so that asking for DIRECTOR
   * reaches the service and gets the refusal that explains why, instead of a generic
   * "role must be one of" from the validator.
   */
  @IsIn(Object.values(UserRole))
  role!: UserRole;

  /**
   * The invitee's name, when the inviter knows it (#225). Optional so a manager can still invite
   * by email alone; the person is then asked for it at first sign-in. First and last come as a
   * pair, which the service enforces.
   */
  @ToStaffNamePart()
  @IsOptional()
  @IsStaffNamePart()
  firstName?: string;

  @ToMiddleInitial()
  @IsOptional()
  @IsMiddleInitial()
  middleInitial?: string | null;

  @ToStaffNamePart()
  @IsOptional()
  @IsStaffNamePart()
  lastName?: string;

  /** How long the invitation stays open. Constrained to what the form offers. */
  @IsOptional()
  @Type(() => Number)
  @IsIn([...SELECTABLE_STAFF_INVITE_TTL_HOURS])
  ttlHours?: number;

  /**
   * The inviter has been told this address already belongs to a staff account, and means it.
   *
   * The first attempt is refused with STAFF_INVITE_ADDRESS_IN_USE; this is how the second one
   * says "yes, that person". Without it a shared inbox reused across two colleagues would hand
   * the second role to whoever reads the mail, with nobody having been asked.
   */
  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  confirmExistingAccount?: boolean;
}

export class ClinicStaffInviteParamsDto extends ClinicIdParamDto {
  @IsUUID()
  inviteId!: string;
}

export class StaffInviteIdParamDto {
  @IsUUID()
  inviteId!: string;
}
