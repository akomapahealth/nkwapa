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
import { CounsellingService } from './counselling.service';
import { UpsertCounsellingDto } from './dto/counselling.dto';

/** The review station's counselling record (#167). Online only, like clinical notes. */
@Controller('clinics/:clinicId/encounters/:encounterId/counselling')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class CounsellingController {
  constructor(private readonly counsellingService: CounsellingService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.COUNSELLING_READ)
  get(@Param() params: ClinicAndEncounterParamsDto) {
    this.assertEnabled();
    return this.counsellingService.get(params.clinicId, params.encounterId);
  }

  @Put()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.COUNSELLING_WRITE)
  upsert(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() body: UpsertCounsellingDto,
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
  ) {
    this.assertEnabled();
    return this.counsellingService.upsert(
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
