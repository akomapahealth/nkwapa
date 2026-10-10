import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
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
import { ClinicAndPatientParamsDto, ClinicPatientHistoryParamsDto } from '../common/request-dto';
import { isApiFeatureEnabled } from '../common/feature-flags';
import {
  CreateMedicalHistoryDto,
  ListMedicalHistoryQueryDto,
  ReviseMedicalHistoryDto,
} from './dto/medical-history.dto';
import { MedicalHistoryService } from './medical-history.service';

type AuthenticatedRequest = {
  user: { user: { id: string } };
  headers?: { 'x-request-id'?: string };
  ip?: string;
};

@Controller('clinics/:clinicId/patients/:patientId')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class MedicalHistoryController {
  constructor(private readonly medicalHistoryService: MedicalHistoryService) {}

  @Get('allergy-summary')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICAL_HISTORY_READ)
  allergySummary(@Param() params: ClinicAndPatientParamsDto) {
    this.assertEnabled();
    return this.medicalHistoryService.getAllergySummary(params.clinicId, params.patientId);
  }

  @Get('medical-history')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICAL_HISTORY_READ)
  list(@Param() params: ClinicAndPatientParamsDto, @Query() query: ListMedicalHistoryQueryDto) {
    this.assertEnabled();
    return this.medicalHistoryService.list(params.clinicId, params.patientId, query);
  }

  @Post('medical-history')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICAL_HISTORY_WRITE)
  create(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: CreateMedicalHistoryDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.medicalHistoryService.create(
      params.clinicId,
      params.patientId,
      request.user.user.id,
      dto,
      request.headers?.['x-request-id'],
    );
  }

  @Get('medical-history/:recordId/revisions')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICAL_HISTORY_READ)
  revisions(@Param() params: ClinicPatientHistoryParamsDto) {
    this.assertEnabled();
    return this.medicalHistoryService.listRevisions(
      params.clinicId,
      params.patientId,
      params.recordId,
    );
  }

  @Post('medical-history/:recordId/revisions')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICAL_HISTORY_WRITE)
  revise(
    @Param() params: ClinicPatientHistoryParamsDto,
    @Body() dto: ReviseMedicalHistoryDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.medicalHistoryService.revise(
      params.clinicId,
      params.patientId,
      params.recordId,
      request.user.user.id,
      dto,
      request.headers?.['x-request-id'],
    );
  }

  private assertEnabled() {
    if (!isApiFeatureEnabled('medicalHistory')) {
      throw new NotFoundException();
    }
  }
}
