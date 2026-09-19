import { Body, Controller, Get, Param, Put, Query, Request, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional } from 'class-validator';
import { MedicationAdherenceContext } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import type { ScopedRole } from '../auth/clinic-roles';
import { ClinicAndEncounterParamsDto } from '../common/request-dto';
import { MedicationAdherenceService } from './medication-adherence.service';
import { UpsertMedicationAdherenceDto } from './dto/medication-adherence.dto';

export class MedicationAdherenceQueryDto {
  /** Omitted returns both conditions, which is what the patient chart wants. */
  @IsOptional()
  @IsEnum(MedicationAdherenceContext)
  context?: MedicationAdherenceContext;
}

type MedicationAdherenceRequest = {
  user: { user: { id: string }; roles: ScopedRole[] };
  headers?: { 'x-request-id'?: string; 'user-agent'?: string };
  ip?: string;
};

/**
 * REST for per-encounter medication adherence.
 *
 * Gated on the interview's permissions rather than medication reconciliation's: the row is an
 * encounter observation saved with the rest of the interview, and it has to be refused on a
 * finalized encounter along with it. Reading the reconciled list itself is a different route with
 * a different permission, and this module never writes to it.
 */
@Controller('clinics/:clinicId/encounters/:encounterId/medication-adherence')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class MedicationAdherenceController {
  constructor(private readonly medicationAdherenceService: MedicationAdherenceService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_READ)
  list(
    @Param() params: ClinicAndEncounterParamsDto,
    @Query() query: MedicationAdherenceQueryDto,
    @Request() request: MedicationAdherenceRequest,
  ) {
    return this.medicationAdherenceService.list(
      params.clinicId,
      params.encounterId,
      { userId: request.user.user.id, roles: request.user.roles },
      query.context,
    );
  }

  /**
   * Replace the whole set for one condition.
   *
   * A `PUT` of the set rather than a `POST` per row: removing a medication from the reconciled
   * list has to remove its observation, and nothing in a per-row request would say so.
   */
  @Put()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.SCREENING_WRITE)
  replace(
    @Param() params: ClinicAndEncounterParamsDto,
    @Body() dto: UpsertMedicationAdherenceDto,
    @Request() request: MedicationAdherenceRequest,
  ) {
    return this.medicationAdherenceService.replaceForEncounter(
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
}
