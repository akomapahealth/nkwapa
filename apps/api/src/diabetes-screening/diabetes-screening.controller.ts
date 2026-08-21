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
import { DiabetesScreeningService } from './diabetes-screening.service';
import { UpsertDiabetesScreeningDto } from './dto/diabetes-screening.dto';

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
}
