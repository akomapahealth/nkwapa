import { Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../common/rate-limit.decorator';
import { IncludeStaffInviteScope } from '../staff-invites/staff-invite-scope.decorator';
import { IncludeLapsedInviteScope } from './lapsed-invite-scope.decorator';
import { InviteRenewalService } from './invite-renewal.service';

/**
 * The invitee's side of a lapsed invitation (#307, B7). Authentication only, like
 * /staff-invites/mine: the caller holds no role in the clinic that invited them.
 */
@Controller('me/invitations')
@UseGuards(JwtAuthGuard)
export class InviteRenewalController {
  constructor(private readonly inviteRenewalService: InviteRenewalService) {}

  @Post('renewal-request')
  @HttpCode(202)
  @IncludeStaffInviteScope()
  @IncludeLapsedInviteScope()
  @RateLimit({ key: 'invite_renewal_request', limit: 3, windowSeconds: 3600, scope: 'user-or-ip' })
  async requestRenewal(
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.inviteRenewalService.requestRenewal(
      req.user.user.id,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
