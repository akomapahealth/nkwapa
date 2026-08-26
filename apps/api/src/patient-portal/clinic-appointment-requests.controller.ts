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

  /**
   * Read the requests patients have sent this clinic.
   *
   * `APPOINTMENT.READ` rather than `CLINIC_READ`: confirming and rejecting below require
   * `APPOINTMENT.WRITE`, which a doctor holds and `CLINIC_READ` does not grant. Gating the list
   * on `CLINIC_READ` let a doctor act on a request they could not open.
   */
  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_READ)
  async listAppointmentRequests(
    @Param('clinicId') clinicId: string,
    @Query() query: ListAppointmentRequestsQueryDto,
  ) {
    return this.patientPortalService.listAppointmentRequestsForClinic(clinicId, query);
  }

  @Post(':requestId/confirm')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_WRITE)
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
  @RequirePermission(PERMISSIONS.APPOINTMENT_WRITE)
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
