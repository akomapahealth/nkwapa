import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PatientPortalService } from './patient-portal.service';
import { CreateSelfReportDto } from './dto/create-self-report.dto';
import { PERMISSIONS } from '../auth/constants/permissions';

@Controller('clinics/:clinicId/patient-portal')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PatientPortalController {
  constructor(private readonly patientPortalService: PatientPortalService) {}

  @Get('me')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_READ_SELF)
  async getMe(
    @Param('clinicId') clinicId: string,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.patientPortalService.getMe(clinicId, req.user.user.id);
  }

  @Get('self-reports')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_READ_SELF)
  async listSelfReports(
    @Param('clinicId') clinicId: string,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.patientPortalService.listSelfReports(clinicId, req.user.user.id);
  }

  @Post('self-reports')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT)
  async createSelfReport(
    @Param('clinicId') clinicId: string,
    @Body() dto: CreateSelfReportDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    const requestId = req.headers?.['x-request-id'] ?? undefined;
    return this.patientPortalService.createSelfReport(clinicId, req.user.user.id, dto, requestId);
  }
}
