import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
import { PatientDataRequestsService } from './patient-data-requests.service';
import {
  CreatePatientDataRequestDto,
  ListPatientDataRequestsQueryDto,
  RespondPatientDataRequestDto,
} from './dto/patient-data-requests.dto';

type RequestWithUser = {
  clinicId?: string;
  user: { user: { id: string } };
  headers?: { 'x-request-id'?: string };
};

/** A patient's own data rights requests, from the portal. */
@Controller('patients/me/data-requests')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PatientDataRequestsController {
  constructor(private readonly service: PatientDataRequestsService) {}

  @Post()
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT)
  @RateLimit({
    key: 'patient_data_request_write',
    limit: 5,
    windowSeconds: 3600,
    scope: 'user-or-ip',
  })
  async create(@Body() dto: CreatePatientDataRequestDto, @Request() req: RequestWithUser) {
    if (!req.clinicId) throw new BadRequestException('X-Clinic-Id header is required');
    return this.service.createForPatient(
      req.clinicId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get()
  @ClinicScoped({ type: 'header', headerKey: 'x-clinic-id' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_READ_SELF)
  async list(@Request() req: RequestWithUser) {
    if (!req.clinicId) throw new BadRequestException('X-Clinic-Id header is required');
    return this.service.listForPatient(req.clinicId, req.user.user.id);
  }
}

/** The clinic's queue of data rights requests, for managers and directors. */
@Controller('clinics/:clinicId/data-requests')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicDataRequestsController {
  constructor(private readonly service: PatientDataRequestsService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DATA_REQUEST_MANAGE)
  async list(@Param('clinicId') clinicId: string, @Query() query: ListPatientDataRequestsQueryDto) {
    return this.service.listForClinic(clinicId, query);
  }

  @Patch(':requestId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DATA_REQUEST_MANAGE)
  async respond(
    @Param('clinicId') clinicId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RespondPatientDataRequestDto,
    @Request() req: RequestWithUser,
  ) {
    return this.service.respond(
      clinicId,
      requestId,
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
