import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
import { ClinicIdParamDto } from '../common/request-dto';
import { StaffInviteService } from './staff-invite.service';
import { ClinicStaffInviteParamsDto, CreateStaffInviteDto } from './dto/staff-invite.dto';

type InviteRequest = { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } };

/**
 * Issuing staff invitations for one clinic.
 *
 * Three layers refuse a director reaching into another clinic, deliberately: ClinicScopeGuard on
 * the route parameter, the permission, and the role ceiling in the service, which reads the
 * actor's own role rows rather than trusting any of the above.
 */
@Controller('clinics/:clinicId/staff-invites')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicStaffInvitesController {
  constructor(private readonly staffInviteService: StaffInviteService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_STAFF_INVITE)
  async list(@Param() params: ClinicIdParamDto, @Request() req: InviteRequest) {
    return this.staffInviteService.listForClinic(this.actor(req), params.clinicId);
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_STAFF_INVITE)
  @RateLimit({ key: 'staff_invite_create', limit: 30, windowSeconds: 600, scope: 'user' })
  async create(
    @Param() params: ClinicIdParamDto,
    @Body() dto: CreateStaffInviteDto,
    @Request() req: InviteRequest,
  ) {
    return this.staffInviteService.create(
      this.actor(req),
      params.clinicId,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Post(':inviteId/resend')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_STAFF_INVITE)
  @RateLimit({ key: 'staff_invite_resend', limit: 5, windowSeconds: 600, scope: 'user' })
  async resend(@Param() params: ClinicStaffInviteParamsDto, @Request() req: InviteRequest) {
    return this.staffInviteService.resend(
      this.actor(req),
      params.clinicId,
      params.inviteId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Delete(':inviteId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_STAFF_INVITE)
  async cancel(@Param() params: ClinicStaffInviteParamsDto, @Request() req: InviteRequest) {
    return this.staffInviteService.cancel(
      this.actor(req),
      params.clinicId,
      params.inviteId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  private actor(req: InviteRequest) {
    return { userId: req.user.user.id, roles: req.user.roles };
  }
}
