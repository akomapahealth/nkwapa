import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { PatientPortalService } from './patient-portal.service';
import {
  CreatePatientMeasurementDto,
  ListPatientMeasurementsQueryDto,
} from './dto/patient-measurements.dto';
import { ListPatientTrendsQueryDto } from './dto/patient-trends.dto';
import {
  CreateAppointmentRequestDto,
  ListAppointmentRequestsQueryDto,
} from './dto/appointment-requests.dto';
import { PatientIdParamDto } from '../common/request-dto';
import { RateLimit } from '../common/rate-limit.decorator';

type RequestWithUser = {
  clinicId?: string;
  user: { user: { id: string } };
  headers?: { 'x-request-id'?: string };
};

@Controller('patients')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PatientApiController {
  constructor(private readonly patientPortalService: PatientPortalService) {}

  @Post('me/measurements')
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT)
  @RateLimit({
    key: 'patient_portal_measurement_write',
    limit: 20,
    windowSeconds: 60,
    scope: 'user-or-ip',
  })
  async createMeasurement(
    @Body() dto: CreatePatientMeasurementDto,
    @Request() req: RequestWithUser,
  ) {
    if (!req.clinicId) {
      throw new BadRequestException('X-Clinic-Id header is required');
    }
    return this.patientPortalService.createMeasurementForAuthenticatedPatient(
      req.clinicId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get('me/measurements')
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_READ_SELF)
  async listMeasurements(
    @Query() query: ListPatientMeasurementsQueryDto,
    @Request() req: RequestWithUser,
  ) {
    if (!req.clinicId) {
      throw new BadRequestException('X-Clinic-Id header is required');
    }
    return this.patientPortalService.listMeasurementsForAuthenticatedPatient(
      req.clinicId,
      req.user.user.id,
      query,
    );
  }

  @Get('me/trends')
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_READ_SELF)
  async listTrends(@Query() query: ListPatientTrendsQueryDto, @Request() req: RequestWithUser) {
    if (!req.clinicId) {
      throw new BadRequestException('X-Clinic-Id header is required');
    }
    return this.patientPortalService.listTrendsForAuthenticatedPatient(
      req.clinicId,
      req.user.user.id,
      query,
    );
  }

  @Post('me/appointment-requests')
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT)
  @RateLimit({
    key: 'patient_portal_appointment_request_write',
    limit: 10,
    windowSeconds: 300,
    scope: 'user-or-ip',
  })
  async createAppointmentRequest(
    @Body() dto: CreateAppointmentRequestDto,
    @Request() req: RequestWithUser,
  ) {
    if (!req.clinicId) {
      throw new BadRequestException('X-Clinic-Id header is required');
    }
    return this.patientPortalService.createAppointmentRequestForAuthenticatedPatient(
      req.clinicId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get('me/appointment-requests')
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_READ_SELF)
  async listAppointmentRequests(
    @Query() query: ListAppointmentRequestsQueryDto,
    @Request() req: RequestWithUser,
  ) {
    if (!req.clinicId) {
      throw new BadRequestException('X-Clinic-Id header is required');
    }
    return this.patientPortalService.listAppointmentRequestsForAuthenticatedPatient(
      req.clinicId,
      req.user.user.id,
      query,
    );
  }

  @Get(':patientId/measurements')
  @ClinicScoped({ type: 'query', queryKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_READ)
  async listMeasurementsForStaff(
    @Param() params: PatientIdParamDto,
    @Query() query: ListPatientMeasurementsQueryDto,
  ) {
    if (!query.clinicId) {
      throw new BadRequestException('clinicId query parameter is required');
    }
    return this.patientPortalService.listMeasurementsForStaff(
      params.patientId,
      query.clinicId,
      query,
    );
  }

  @Get(':patientId/trends')
  @ClinicScoped({ type: 'query', queryKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_READ)
  async listTrendsForStaff(
    @Param() params: PatientIdParamDto,
    @Query() query: ListPatientTrendsQueryDto,
  ) {
    if (!query.clinicId) {
      throw new BadRequestException('clinicId query parameter is required');
    }
    return this.patientPortalService.listTrendsForStaff(params.patientId, query.clinicId, query);
  }
}
