import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicAndPatientParamsDto, CursorLimitQueryDto } from '../common/request-dto';
import { PatientChartService } from './patient-chart.service';

type ChartRequest = {
  user: { user: { id: string }; roles: Array<{ clinicId: string | null; role: UserRole }> };
};

const actorFrom = (request: ChartRequest) => ({
  userId: request.user.user.id,
  roles: request.user.roles,
});

/**
 * Read-only longitudinal chart surface.
 *
 * Guards enforce clinic scope and the coarse permission per route; the service then omits
 * any summary block the caller may not read, so unauthorised data is never serialised.
 */
@Controller('clinics/:clinicId/patients/:patientId/chart')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PatientChartController {
  constructor(private readonly patientChartService: PatientChartService) {}

  @Get('summary')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_READ)
  summary(@Param() params: ClinicAndPatientParamsDto, @Request() request: ChartRequest) {
    return this.patientChartService.getSummary(
      params.clinicId,
      params.patientId,
      actorFrom(request),
    );
  }

  @Get('vitals')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  vitals(@Param() params: ClinicAndPatientParamsDto, @Query() query: CursorLimitQueryDto) {
    return this.patientChartService.listVitals(params.clinicId, params.patientId, query);
  }

  @Get('visits')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  visits(
    @Param() params: ClinicAndPatientParamsDto,
    @Query() query: CursorLimitQueryDto,
    @Request() request: ChartRequest,
  ) {
    return this.patientChartService.listVisits(
      params.clinicId,
      params.patientId,
      actorFrom(request),
      query,
    );
  }
}
