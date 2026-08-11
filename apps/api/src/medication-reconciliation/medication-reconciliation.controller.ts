import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsUUID } from 'class-validator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicAndPatientParamsDto } from '../common/request-dto';
import { isApiFeatureEnabled } from '../common/feature-flags';
import {
  CreatePatientMedicationDto,
  CreatePatientPharmacyDto,
  EndPreferredPharmacyDto,
  ReconcileMedicationListDto,
  RevisePatientMedicationDto,
  RevisePatientPharmacyDto,
  SetPreferredPharmacyDto,
} from './dto/medication-reconciliation.dto';
import { MedicationReconciliationService } from './medication-reconciliation.service';

class RecordParamsDto extends ClinicAndPatientParamsDto {
  @IsUUID()
  recordId!: string;
}

type AuthenticatedRequest = {
  user: { user: { id: string } };
  headers?: { 'x-request-id'?: string; 'user-agent'?: string };
  ip?: string;
};

@Controller('clinics/:clinicId/patients/:patientId/medication-reconciliation')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class MedicationReconciliationController {
  constructor(private readonly service: MedicationReconciliationService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_READ)
  list(@Param() params: ClinicAndPatientParamsDto) {
    this.assertEnabled();
    return this.service.list(params.clinicId, params.patientId);
  }

  @Post('medications')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  createMedication(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: CreatePatientMedicationDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.createMedication(
      params.clinicId,
      params.patientId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Get('medications/:recordId/revisions')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_READ)
  medicationRevisions(@Param() params: RecordParamsDto) {
    this.assertEnabled();
    return this.service.listMedicationRevisions(params.clinicId, params.patientId, params.recordId);
  }

  @Post('medications/:recordId/revisions')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  reviseMedication(
    @Param() params: RecordParamsDto,
    @Body() dto: RevisePatientMedicationDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.reviseMedication(
      params.clinicId,
      params.patientId,
      params.recordId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Post('reconciliations')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  reconcile(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: ReconcileMedicationListDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.reconcile(
      params.clinicId,
      params.patientId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Post('pharmacies')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  createPharmacy(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: CreatePatientPharmacyDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.createPharmacy(
      params.clinicId,
      params.patientId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Get('pharmacies/:recordId/revisions')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_READ)
  pharmacyRevisions(@Param() params: RecordParamsDto) {
    this.assertEnabled();
    return this.service.listPharmacyRevisions(params.clinicId, params.patientId, params.recordId);
  }

  @Post('pharmacies/:recordId/revisions')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  revisePharmacy(
    @Param() params: RecordParamsDto,
    @Body() dto: RevisePatientPharmacyDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.revisePharmacy(
      params.clinicId,
      params.patientId,
      params.recordId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Post('pharmacies/:recordId/preference')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  setPreference(
    @Param() params: RecordParamsDto,
    @Body() dto: SetPreferredPharmacyDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.setPreferredPharmacy(
      params.clinicId,
      params.patientId,
      params.recordId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Post('pharmacy-preference/end')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)
  endPreference(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: EndPreferredPharmacyDto,
    @Request() request: AuthenticatedRequest,
  ) {
    this.assertEnabled();
    return this.service.endPreferredPharmacy(
      params.clinicId,
      params.patientId,
      request.user.user.id,
      dto,
      this.context(request),
    );
  }

  @Get('prescription-history')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_READ)
  prescriptionHistory(@Param() params: ClinicAndPatientParamsDto) {
    this.assertEnabled();
    return this.service.prescriptionHistory(params.clinicId, params.patientId);
  }

  private assertEnabled() {
    if (!isApiFeatureEnabled('medicationReconciliation')) throw new NotFoundException();
  }

  private context(request: AuthenticatedRequest) {
    return {
      requestId: request.headers?.['x-request-id'] ?? randomUUID(),
      ipAddress: request.ip,
      userAgent: request.headers?.['user-agent'],
    };
  }
}
