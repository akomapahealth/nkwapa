import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { AuditService } from './audit.service';
import { PERMISSIONS } from '../auth/constants/permissions';

@Controller('clinics/:clinicId/audit')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  async list(
    @Param('clinicId') clinicId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('requestId') requestId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.list({
      clinicId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      action,
      actorUserId: actor,
      entityType,
      entityId,
      requestId,
      cursor,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}
