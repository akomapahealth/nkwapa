import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { DashboardService } from './dashboard.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { rolesForClinic, type ScopedRole } from '../auth/clinic-roles';

@Controller('clinics/:clinicId/dashboard')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.DASHBOARD_READ)
  async getDashboard(
    @Param('clinicId') clinicId: string,
    @Request()
    req: {
      user: { user: { id: string }; roles: { role: string; clinicId: string | null }[] };
    },
  ) {
    const userId = req.user.user.id;
    // Through the shared helper rather than a local filter: a global grant other than
    // SYSTEM_ADMIN would otherwise unlock this clinic's dashboard from a seat elsewhere.
    const roles = rolesForClinic(req.user.roles as ScopedRole[], clinicId).map((r) => r.role);

    return this.dashboardService.getDashboard(clinicId, roles, userId);
  }
}
