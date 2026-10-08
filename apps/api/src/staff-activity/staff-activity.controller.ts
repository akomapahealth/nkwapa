import { Controller, Get, Param, ParseUUIDPipe, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { StaffActivityService } from './staff-activity.service';
import { StaffActivityQueryDto } from './dto/staff-activity-query.dto';

/**
 * Staff workload at a clinic (#33). `AUDIT.READ`, held by directors and managers (and system
 * administrators through `*`): this is a summary of the audit trail they can already read.
 */
@Controller('clinics/:clinicId/staff-activity')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class StaffActivityController {
  constructor(private readonly staffActivity: StaffActivityService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  overview(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Query() query: StaffActivityQueryDto,
  ) {
    return this.staffActivity.overview(clinicId, query);
  }

  @Get(':userId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  person(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: StaffActivityQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.staffActivity.person(clinicId, userId, req.user.roles, query);
  }
}
