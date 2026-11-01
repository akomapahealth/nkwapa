import { Body, Controller, ForbiddenException, Patch, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { holdsStaffRole } from '../auth/clinic-roles';
import type { ReqUser } from '../auth/auth.controller';
import { RateLimit } from '../common/rate-limit.decorator';
import { UpdateStaffNameDto } from './dto/staff-name.dto';
import { UpdateStaffPhoneDto } from './dto/staff-phone.dto';
import {
  UserProfileService,
  type NameChangeContext,
  type StaffNameView,
} from './user-profile.service';

type ProfileRequest = { user: ReqUser; headers?: { 'x-request-id'?: string } };

/** The signed-in person's own profile. The user id always comes from the token. */
@Controller('me/profile')
@UseGuards(JwtAuthGuard)
export class MeProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Patch('name')
  @RateLimit({ key: 'me_profile_name', limit: 20, windowSeconds: 60, scope: 'user-or-ip' })
  async updateName(
    @Request() req: ProfileRequest,
    @Body() dto: UpdateStaffNameDto,
  ): Promise<StaffNameView> {
    // A patient's name lives on their Patient record, which this does not touch.
    this.assertStaff(req, 'Only staff accounts have a name here');
    return this.userProfileService.updateName(req.user.user.id, dto, this.context(req));
  }

  @Patch('phone')
  @RateLimit({ key: 'me_profile_phone', limit: 20, windowSeconds: 60, scope: 'user-or-ip' })
  async updatePhone(@Request() req: ProfileRequest, @Body() dto: UpdateStaffPhoneDto) {
    // A patient's phone lives on their Patient record, where reminders are sent from.
    this.assertStaff(req, 'Only staff accounts have a work phone here');
    return this.userProfileService.updatePhone(req.user.user.id, dto.phone, this.context(req));
  }

  private assertStaff(req: ProfileRequest, message: string) {
    if (!holdsStaffRole(req.user.roles)) throw new ForbiddenException(message);
  }

  private context(req: ProfileRequest): NameChangeContext {
    return {
      actorUserId: req.user.user.id,
      source: 'SELF',
      // AuditEvent RLS admits a null clinic only for a system admin, so attach one of the
      // person's own staff clinics. A global-only system admin has none, and null is fine there.
      clinicId:
        req.user.roles.find((entry) => entry.clinicId && entry.role !== UserRole.PATIENT)
          ?.clinicId ?? null,
      requestId: req.headers?.['x-request-id'] ?? randomUUID(),
    };
  }
}
