import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
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
import { isApiFeatureEnabled } from '../common/feature-flags';
import { DiabetesScreeningService } from './diabetes-screening.service';
import {
  UpsertDiabetesClinicianPlanDto,
  UpsertDiabetesScreeningDto,
} from './dto/diabetes-screening.dto';

type DiabetesRequest = {
  user: { user: { id: string }; roles: ScopedRole[] };
  headers?: { 'x-request-id'?: string; 'user-agent'?: string };
  ip?: string;
};

@Controller('clinics/:clinicId')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class DiabetesScreeningController {
  constructor(private readonly diabetesScreeningService: DiabetesScreeningService) {}

  @Get('patients/:patientId/diabetes-screenings')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_READ)
  list(
    @Param() params: ClinicAndPatientParamsDto,
    @Query() query: CursorLimitQueryDto,
    @Request() request: DiabetesRequest,
  ) {
    return this.diabetesScreeningService.list(
      params.clinicId,
      params.patientId,
      { userId: request.user.user.id, roles: request.user.roles },
      query,
    );
  }

  @Put('encounters/:encounterId/diabetes-screening')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_WRITE)
  upsert(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() dto: UpsertDiabetesScreeningDto,
    @Request() request: DiabetesRequest,
  ) {
    return this.diabetesScreeningService.upsert(
      params.clinicId,
      params.encounterId,
      { userId: request.user.user.id, roles: request.user.roles },
      dto,
      {
        requestId: request.headers?.['x-request-id'],
        userAgent: request.headers?.['user-agent'],
        ipAddress: request.ip,
      },
    );
  }

  /**
   * The supervising clinician's plan, on its own route behind its own permission.
   *
   * A volunteer sending these keys is a request the guard refuses, rather than one whose extra
   * keys are stripped in a branch somebody can later delete.
   */
  @Put('encounters/:encounterId/diabetes-screening/clinician-plan')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CAREPLAN_CLINICIAN_PLAN)
  upsertClinicianPlan(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() dto: UpsertDiabetesClinicianPlanDto,
    @Request() request: DiabetesRequest,
  ) {
    this.assertGuidedInterviewEnabled();
    return this.diabetesScreeningService.upsertClinicianPlan(
      params.clinicId,
      params.encounterId,
      { userId: request.user.user.id, roles: request.user.roles },
      dto,
      {
        requestId: request.headers?.['x-request-id'],
        ipAddress: request.ip,
        userAgent: request.headers?.['user-agent'],
      },
    );
  }

  /**
   * Gates the clinician plan alone, not this controller.
   *
   * Diabetes screening shipped long before the guided interview and its list and upsert routes
   * are read and written outside it, so gating the module would withdraw working behaviour. The
   * clinician plan is the only surface here the interview introduced, which is why it is the only
   * one that disappears when the interview is off. Hypertension gates its whole controller
   * because its whole controller is new.
   */
  private assertGuidedInterviewEnabled() {
    if (!isApiFeatureEnabled('guidedChronicTabs')) throw new NotFoundException();
  }
}
