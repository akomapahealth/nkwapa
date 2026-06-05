import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { PatientPortalService } from './patient-portal.service';
import { ListAppointmentsQueryDto } from './dto/appointment-requests.dto';

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
}
