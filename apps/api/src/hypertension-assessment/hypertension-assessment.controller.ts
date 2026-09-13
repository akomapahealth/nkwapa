import { Body, Controller, Get, Param, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import type { ScopedRole } from '../auth/clinic-roles';
import {
  ClinicAndEncounterParamsDto,
  ClinicAndPatientParamsDto,
  CursorLimitQueryDto,
} from '../common/request-dto';
import { HypertensionAssessmentService } from './hypertension-assessment.service';
import {
  UpsertHypertensionAssessmentDto,
  UpsertHypertensionClinicianPlanDto,
} from './dto/hypertension-assessment.dto';

type HypertensionRequest = {
  user: { user: { id: string }; roles: ScopedRole[] };
  headers?: { 'x-request-id'?: string; 'user-agent'?: string };
  ip?: string;
};

/**
 * REST for the hypertension interview.
 *
 * Before this controller, hypertension had no REST surface at all: it was written only by an
 * inline, unvalidated upsert inside the offline sync handler, and read only as a side effect of
 * fetching the encounter. Diabetes has had a module like this since
 * `20260812000000_promote_diabetes_screening`; the two conditions look like siblings in the UI and
 * were not siblings in the codebase.
 */
@Controller('clinics/:clinicId')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class HypertensionAssessmentController {
  constructor(private readonly hypertensionAssessmentService: HypertensionAssessmentService) {}

  @Get('patients/:patientId/hypertension-assessments')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_READ)
  list(
    @Param() params: ClinicAndPatientParamsDto,
    @Query() query: CursorLimitQueryDto,
    @Request() request: HypertensionRequest,
  ) {
    return this.hypertensionAssessmentService.list(
      params.clinicId,
      params.patientId,
      { userId: request.user.user.id, roles: request.user.roles },
      query,
    );
  }

  @Put('encounters/:encounterId/hypertension-assessment')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_WRITE)
  upsert(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() dto: UpsertHypertensionAssessmentDto,
    @Request() request: HypertensionRequest,
  ) {
    return this.hypertensionAssessmentService.upsert(
      params.clinicId,
      params.encounterId,
      { userId: request.user.user.id, roles: request.user.roles },
      dto,
      this.metadataFrom(request),
    );
  }

  /**
   * The supervising clinician's plan, on its own route behind its own permission.
   *
   * A separate route rather than optional fields on the upsert above, so that a volunteer sending
   * clinician-plan keys is a request the guard refuses rather than one whose extra keys are
   * stripped in a branch somebody can later delete.
   */
  @Put('encounters/:encounterId/hypertension-assessment/clinician-plan')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CAREPLAN_CLINICIAN_PLAN)
  upsertClinicianPlan(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() dto: UpsertHypertensionClinicianPlanDto,
    @Request() request: HypertensionRequest,
  ) {
    return this.hypertensionAssessmentService.upsertClinicianPlan(
      params.clinicId,
      params.encounterId,
      { userId: request.user.user.id, roles: request.user.roles },
      dto,
      this.metadataFrom(request),
    );
  }

  private metadataFrom(request: HypertensionRequest) {
    return {
      requestId: request.headers?.['x-request-id'],
      ipAddress: request.ip,
      userAgent: request.headers?.['user-agent'],
    };
  }
}
