import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../common/rate-limit.decorator';
import { StaffInviteService } from './staff-invite.service';
import { StaffInviteIdParamDto } from './dto/staff-invite.dto';
import { IncludeStaffInviteScope } from './staff-invite-scope.decorator';

/**
 * The invitee's side: see what you have been invited to, and accept it.
 *
 * Authentication only, with no permission guard, for the same reason /patients/me/claim-record
 * has none: the caller is by definition someone who does not hold the role yet. What protects
 * these routes is that every read and write is keyed to the caller's verified email.
 */
@Controller('staff-invites')
@UseGuards(JwtAuthGuard)
@IncludeStaffInviteScope()
export class StaffInviteAcceptanceController {
  constructor(private readonly staffInviteService: StaffInviteService) {}

  @Get('mine')
  @RateLimit({ key: 'staff_invite_mine', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  async mine(@Request() req: { user: { user: { id: string } } }) {
    return this.staffInviteService.listMine(req.user.user.id);
  }

  @Post(':inviteId/accept')
  @RateLimit({ key: 'staff_invite_accept', limit: 10, windowSeconds: 600, scope: 'user-or-ip' })
  async accept(
    @Param() params: StaffInviteIdParamDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.staffInviteService.accept(
      req.user.user.id,
      params.inviteId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
