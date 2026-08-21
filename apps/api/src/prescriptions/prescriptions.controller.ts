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
import { PrescriptionService } from './prescription.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import {
  ClinicAndEncounterParamsDto,
  ClinicAndEncounterPrescriptionParamsDto,
} from '../common/request-dto';

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
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.prescriptionService.create(params.clinicId, params.encounterId, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
    });
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_READ)
  async listByEncounter(@Param() params: ClinicAndEncounterParamsDto) {
    return this.prescriptionService.listByEncounter(params.encounterId);
  }

  @Patch(':id')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async update(
    @Param() params: ClinicAndEncounterPrescriptionParamsDto,
    @Body() body: UpdatePrescriptionDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.prescriptionService.update(params.id, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
    });
  }

  @Delete(':id')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async remove(
    @Param() params: ClinicAndEncounterPrescriptionParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    await this.prescriptionService.remove(params.id, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
    });
    return { deleted: true };
  }
}
