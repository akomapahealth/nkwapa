import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicAndEncounterParamsDto } from '../common/request-dto';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { EyeScreeningService } from './eye-screening.service';
import { UpsertEyeScreeningDto } from './dto/eye-screening.dto';

/** The Eye station's examination. Online only, and part of the station line's flag. */
@Controller('clinics/:clinicId/encounters/:encounterId/eye-screening')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class EyeScreeningController {
  constructor(private readonly eyeScreeningService: EyeScreeningService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_READ)
  get(@Param() params: ClinicAndEncounterParamsDto) {
    this.assertEnabled();
    return this.eyeScreeningService.get(params.clinicId, params.encounterId);
  }

  @Put()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_WRITE)
  upsert(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() body: UpsertEyeScreeningDto,
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
  ) {
    this.assertEnabled();
    return this.eyeScreeningService.upsert(
      params.clinicId,
      params.encounterId,
      req.user.user.id,
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  private assertEnabled() {
    if (!isApiFeatureEnabled('stationWorkflow')) throw new NotFoundException();
  }
}
