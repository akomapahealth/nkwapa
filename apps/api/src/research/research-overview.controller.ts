import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicAndExportParamsDto, ClinicIdParamDto } from '../common/request-dto';
import { ResearchOverviewService } from './research-overview.service';

/** The research page's readiness, decision queue and per-run trail (#166). */
@Controller('clinics/:clinicId/research')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ResearchOverviewController {
  constructor(private readonly overview: ResearchOverviewService) {}

  @Get('overview')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  get(@Param() params: ClinicIdParamDto) {
    return this.overview.overview(params.clinicId);
  }

  @Get('exports/:exportId/events')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  events(@Param() params: ClinicAndExportParamsDto) {
    return this.overview.events(params.clinicId, params.exportId);
  }
}
