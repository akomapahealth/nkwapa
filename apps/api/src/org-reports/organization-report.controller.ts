import { Controller, Get, Param, ParseUUIDPipe, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
import { OrganizationReportService } from './organization-report.service';

/**
 * Organization rollups. Deliberately not under /clinics/:clinicId: the whole point is to read
 * across clinics, so there is no clinic to scope to and ClinicScopeGuard does not apply. The
 * permission and the service's own system-admin check are the boundary.
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class OrganizationReportController {
  constructor(private readonly reportService: OrganizationReportService) {}

  @Get(':organizationId/report')
  @RequirePermission(PERMISSIONS.ORGANIZATION_REPORT_READ)
  @RateLimit({ key: 'organization_report', limit: 30, windowSeconds: 60, scope: 'user' })
  async getReport(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.reportService.getReport(
      { userId: req.user.user.id, roles: req.user.roles },
      organizationId,
    );
  }
}
