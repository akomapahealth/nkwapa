import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { ClinicAndPatientParamsDto } from '../common/request-dto';
import { CreateReferralReportDto } from './dto/referral-report.dto';
import { ReferralReportService } from './referral-report.service';

type ReportRequest = {
  user: { user: { id: string }; roles: Array<{ clinicId: string | null; role: UserRole }> };
};

const actorFrom = (request: ReportRequest) => ({
  userId: request.user.user.id,
  roles: request.user.roles,
});

/**
 * Referral reports (#344). Not @Idempotent and not @Track: the idempotency store keeps response
 * bodies, and this response holds the passcode and the file, neither of which may be kept.
 */
@Controller('clinics/:clinicId/patients/:patientId/referral-report')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ReferralReportController {
  constructor(private readonly service: ReferralReportService) {}

  /** The sections this sender may include, so the sheet offers only those. */
  @Get('sections')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REFERRAL_REPORT_EXPORT)
  sections(@Param() params: ClinicAndPatientParamsDto, @Request() request: ReportRequest) {
    return { sections: this.service.allowedSections(params.clinicId, actorFrom(request)) };
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REFERRAL_REPORT_EXPORT)
  /*
    Also applied here, after the JWT guard: the global copy runs before any controller guard has
    put the user on the request, so a 'user' scoped limit would find no identity and let it through.
  */
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'referral_report', limit: 10, windowSeconds: 600, scope: 'user' })
  create(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: CreateReferralReportDto,
    @Request() request: ReportRequest,
  ) {
    return this.service.create(params.clinicId, params.patientId, actorFrom(request), dto);
  }
}
