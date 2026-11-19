import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { hasPermissionAtClinic, isSystemAdmin, type ScopedRole } from '../auth/clinic-roles';
import { ClinicIdParamDto } from '../common/request-dto';
import { RateLimit } from '../common/rate-limit.decorator';
import { FollowUpRiskService } from './follow-up-risk.service';
import { FollowUpMetricsService } from './follow-up-metrics.service';
import {
  FollowUpMetricPatientsQueryDto,
  FollowUpMetricsQueryDto,
} from './dto/follow-up-metrics.dto';

/** The monthly follow-up indicators (#339), for the roles that read metrics. */
@Controller('clinics/:clinicId/follow-up-metrics')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class FollowUpMetricsController {
  constructor(
    private readonly risk: FollowUpRiskService,
    private readonly metrics: FollowUpMetricsService,
  ) {}

  /** Counts and shares only: no patient appears here. */
  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.METRICS_READ)
  @RateLimit({ key: 'follow_up_metrics', limit: 30, windowSeconds: 60, scope: 'user' })
  report(@Param() params: ClinicIdParamDto, @Query() query: FollowUpMetricsQueryDto) {
    if (!this.risk.enabled) throw new NotFoundException();
    return this.reportFor(params.clinicId, query.month);
  }

  /** The patients behind one figure. Needs PATIENT.READ here as well as METRICS.READ. */
  @Get('patients')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.METRICS_READ)
  @RateLimit({ key: 'follow_up_metric_patients', limit: 30, windowSeconds: 60, scope: 'user' })
  patients(
    @Param() params: ClinicIdParamDto,
    @Query() query: FollowUpMetricPatientsQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    if (!this.risk.enabled) throw new NotFoundException();
    if (
      !hasPermissionAtClinic(
        req.user.roles as ScopedRole[],
        params.clinicId,
        PERMISSIONS.PATIENT_READ,
      )
    ) {
      throw new ForbiddenException('Patient names need patient access at this clinic');
    }
    return this.patientsFor(params.clinicId, query);
  }

  private async reportFor(clinicId: string, month: string | undefined) {
    const scope = await this.metrics.clinicScope(clinicId);
    const now = new Date();
    return this.metrics.report(scope, this.metrics.resolveMonth(month, now, scope.timeZone), now);
  }

  private async patientsFor(clinicId: string, query: FollowUpMetricPatientsQueryDto) {
    const scope = await this.metrics.clinicScope(clinicId);
    const now = new Date();
    return this.metrics.patients(
      scope,
      this.metrics.resolveMonth(query.month, now, scope.timeZone),
      query.figure,
      now,
    );
  }
}

/**
 * The same indicators across an organization's clinics, in the organization's zone. System
 * admins only, like the organization report.
 */
@Controller('organizations/:organizationId/follow-up-metrics')
@UseGuards(JwtAuthGuard, RbacGuard)
export class OrganizationFollowUpMetricsController {
  constructor(
    private readonly risk: FollowUpRiskService,
    private readonly metrics: FollowUpMetricsService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.ORGANIZATION_REPORT_READ)
  @RateLimit({ key: 'organization_follow_up_metrics', limit: 30, windowSeconds: 60, scope: 'user' })
  report(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query() query: FollowUpMetricsQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    this.assertAllowed(req.user);
    return this.reportFor(organizationId, query.month);
  }

  /** The patients behind one figure, across the organization. */
  @Get('patients')
  @RequirePermission(PERMISSIONS.ORGANIZATION_REPORT_READ)
  @RateLimit({
    key: 'organization_follow_up_metric_patients',
    limit: 30,
    windowSeconds: 60,
    scope: 'user',
  })
  patients(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query() query: FollowUpMetricPatientsQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    this.assertAllowed(req.user);
    return this.patientsFor(organizationId, query);
  }

  private assertAllowed(user: ReqUserWithRoles) {
    if (!this.risk.enabled) throw new NotFoundException();
    if (!isSystemAdmin(user.roles as ScopedRole[])) {
      throw new ForbiddenException('Only System Admin can read organization reports');
    }
  }

  private async reportFor(organizationId: string, month: string | undefined) {
    const scope = await this.metrics.organizationScope(organizationId);
    const now = new Date();
    return this.metrics.report(scope, this.metrics.resolveMonth(month, now, scope.timeZone), now);
  }

  private async patientsFor(organizationId: string, query: FollowUpMetricPatientsQueryDto) {
    const scope = await this.metrics.organizationScope(organizationId);
    const now = new Date();
    return this.metrics.patients(
      scope,
      this.metrics.resolveMonth(query.month, now, scope.timeZone),
      query.figure,
      now,
    );
  }
}
