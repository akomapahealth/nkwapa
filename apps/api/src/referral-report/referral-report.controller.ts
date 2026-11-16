import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
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

  /** The sections this sender may include, and any referral consent on file, for the sheet. */
  @Get('sections')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REFERRAL_REPORT_EXPORT)
  async sections(@Param() params: ClinicAndPatientParamsDto, @Request() request: ReportRequest) {
    const consent = await this.service.referralConsent(params.clinicId, params.patientId);
    return {
      sections: this.service.allowedSections(params.clinicId, actorFrom(request)),
      referralConsent: consent ? { grantedAt: consent.grantedAt } : null,
    };
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REFERRAL_REPORT_EXPORT)
  @RateLimit({ key: 'referral_report', limit: 10, windowSeconds: 600, scope: 'user' })
  create(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: CreateReferralReportDto,
    @Request() request: ReportRequest,
  ) {
    return this.service.create(params.clinicId, params.patientId, actorFrom(request), dto);
  }
}
