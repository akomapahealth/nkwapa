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
  CancelAppointmentDto,
  CompleteAppointmentDto,
  ListAppointmentsQueryDto,
  MarkNoShowAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment-requests.dto';

@Controller('clinics/:clinicId/appointments')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicAppointmentsController {
  constructor(private readonly patientPortalService: PatientPortalService) {}

  @Get('staff-options')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_READ)
  async listAppointmentStaffOptions(@Param('clinicId') clinicId: string) {
    return this.patientPortalService.listAppointmentStaffOptionsForClinic(clinicId);
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_READ)
  async listAppointments(
    @Param('clinicId') clinicId: string,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.patientPortalService.listAppointmentsForClinic(clinicId, query);
  }

  @Post(':appointmentId/reschedule')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_WRITE)
  async rescheduleAppointment(
    @Param('clinicId') clinicId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.rescheduleAppointment(
      clinicId,
      appointmentId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Post(':appointmentId/cancel')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_WRITE)
  async cancelAppointment(
    @Param('clinicId') clinicId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: CancelAppointmentDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.cancelAppointment(
      clinicId,
      appointmentId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Post(':appointmentId/complete')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_WRITE)
  async completeAppointment(
    @Param('clinicId') clinicId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: CompleteAppointmentDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.completeAppointment(
      clinicId,
      appointmentId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Post(':appointmentId/no-show')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.APPOINTMENT_WRITE)
  async markAppointmentNoShow(
    @Param('clinicId') clinicId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: MarkNoShowAppointmentDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.markAppointmentNoShow(
      clinicId,
      appointmentId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
