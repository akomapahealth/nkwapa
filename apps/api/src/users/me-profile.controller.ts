import { Body, Controller, ForbiddenException, Patch, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { holdsStaffRole } from '../auth/clinic-roles';
import type { ReqUser } from '../auth/auth.controller';
import { RateLimit } from '../common/rate-limit.decorator';
import { UpdateStaffNameDto } from './dto/staff-name.dto';
import { UserProfileService, type StaffNameView } from './user-profile.service';

/** The signed-in person's own profile. The user id always comes from the token. */
@Controller('me/profile')
@UseGuards(JwtAuthGuard)
export class MeProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Patch('name')
  @RateLimit({ key: 'me_profile_name', limit: 20, windowSeconds: 60, scope: 'user-or-ip' })
  async updateName(
    @Request() req: { user: ReqUser; headers?: { 'x-request-id'?: string } },
    @Body() dto: UpdateStaffNameDto,
  ): Promise<StaffNameView> {
    // A patient's name lives on their Patient record, which this does not touch.
    if (!holdsStaffRole(req.user.roles)) {
      throw new ForbiddenException('Only staff accounts have a name here');
    }
    return this.userProfileService.updateName(req.user.user.id, dto, {
      actorUserId: req.user.user.id,
      source: 'SELF',
      // AuditEvent RLS admits a null clinic only for a system admin, so attach one of the
      // person's own staff clinics. A global-only system admin has none, and null is fine there.
      clinicId:
        req.user.roles.find((entry) => entry.clinicId && entry.role !== UserRole.PATIENT)
          ?.clinicId ?? null,
      requestId: req.headers?.['x-request-id'] ?? randomUUID(),
    });
  }
}
