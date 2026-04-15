import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { PatientPortalService } from './patient-portal.service';
import {
  ConfirmAppointmentRequestDto,
  ListAppointmentRequestsQueryDto,
  RejectAppointmentRequestDto,
} from './dto/appointment-requests.dto';

@Controller('clinics/:clinicId/appointment-requests')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicAppointmentRequestsController {
  constructor(private readonly patientPortalService: PatientPortalService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_READ)
  async listAppointmentRequests(
    @Param('clinicId') clinicId: string,
    @Query() query: ListAppointmentRequestsQueryDto,
  ) {
    return this.patientPortalService.listAppointmentRequestsForClinic(clinicId, query);
  }

  @Post(':requestId/confirm')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_READ)
  async confirmAppointmentRequest(
    @Param('clinicId') clinicId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ConfirmAppointmentRequestDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.confirmAppointmentRequest(
      clinicId,
      requestId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Post(':requestId/reject')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_READ)
  async rejectAppointmentRequest(
    @Param('clinicId') clinicId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RejectAppointmentRequestDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.rejectAppointmentRequest(
      clinicId,
      requestId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
