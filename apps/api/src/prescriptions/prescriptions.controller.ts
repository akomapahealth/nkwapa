import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import type { ScopedRole } from '../auth/clinic-roles';
import { PrescriptionService } from './prescription.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import {
  ClinicAndEncounterParamsDto,
  ClinicAndEncounterPrescriptionParamsDto,
} from '../common/request-dto';

type PrescriptionRequest = { user: { user: { id: string }; roles: ScopedRole[] } };

@Controller('clinics/:clinicId/encounters/:encounterId/prescriptions')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionService: PrescriptionService) {}

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async create(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() body: CreatePrescriptionDto,
    @Request() req: PrescriptionRequest,
  ) {
    return this.prescriptionService.create(params.clinicId, params.encounterId, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      roles: req.user.roles,
    });
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_READ)
  async listByEncounter(
    @Param() params: ClinicAndEncounterParamsDto,
    @Request() req: PrescriptionRequest,
  ) {
    return this.prescriptionService.listByEncounter(
      params.clinicId,
      params.encounterId,
      req.user.roles,
    );
  }

  @Patch(':id')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async update(
    @Param() params: ClinicAndEncounterPrescriptionParamsDto,
    @Body() body: UpdatePrescriptionDto,
    @Request() req: PrescriptionRequest,
  ) {
    return this.prescriptionService.update(params.id, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      roles: req.user.roles,
    });
  }

  @Delete(':id')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async remove(
    @Param() params: ClinicAndEncounterPrescriptionParamsDto,
    @Request() req: PrescriptionRequest,
  ) {
    await this.prescriptionService.remove(params.id, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      roles: req.user.roles,
    });
    return { deleted: true };
  }
}
