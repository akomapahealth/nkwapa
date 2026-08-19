import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { PatientService } from '../patients/patient.service';
import { PatientPortalService } from '../patient-portal/patient-portal.service';
import { CreatePatientBodyDto } from '../patients/dto/create-patient-body.dto';
import { ListPatientRegistryQueryDto } from '../patients/dto/list-patient-registry.query.dto';
import { LinkPortalDto } from '../patient-portal/dto/link-portal.dto';
import { CreatePatientPortalInviteDto } from '../patient-portal/dto/portal-invite.dto';
import { UpdatePatientBodyDto } from '../patients/dto/update-patient-body.dto';
import { PERMISSIONS } from '../auth/constants/permissions';
import {
  ClinicAndPatientParamsDto,
  ClinicPatientInviteParamsDto,
  ClinicIdParamDto,
} from '../common/request-dto';
import { ToOptionalNumber, ToSanitizedString } from '../common/validation';

class SearchPatientsQueryDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  q?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

@Controller('clinics/:clinicId/patients')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicsPatientsController {
  constructor(
    private readonly patientService: PatientService,
    private readonly patientPortalService: PatientPortalService,
  ) {}

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_CREATE)
  async create(
    @Param() params: ClinicIdParamDto,
    @Body() body: CreatePatientBodyDto,
    @Request() req: { user: { user: { id: string }; roles: unknown[] } },
  ) {
    const dto = {
      ...body,
      primaryClinicId: params.clinicId,
      dob: body.dob ? new Date(body.dob) : undefined,
      createdByUserId: req.user.user.id,
    };
    return this.patientService.create(dto, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_SEARCH)
  async listRegistry(
    @Param() params: ClinicIdParamDto,
    @Query() query: ListPatientRegistryQueryDto,
  ) {
    return this.patientService.listRegistry(
      params.clinicId,
      query.q ?? '',
      query.page,
      query.pageSize,
      {
        cursor: query.cursor,
        limit: query.limit,
        location: {
          residentialRegion: query.residentialRegion,
          residentialDistrict: query.residentialDistrict,
          residentialCommunity: query.residentialCommunity,
          residentialLocationStatus: query.residentialLocationStatus,
        },
      },
    );
  }

  @Patch(':patientId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_UPDATE)
  async update(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() body: UpdatePatientBodyDto,
    @Request() req: { user: { user: { id: string }; roles: unknown[] } },
  ) {
    const existing = await this.patientService.findById(params.patientId);
    if (!existing) throw new NotFoundException('Patient not found');
    if (existing.primaryClinicId !== params.clinicId) {
      throw new ForbiddenException('Patient does not belong to this clinic');
    }
    return this.patientService.update(params.patientId, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get('search')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_SEARCH)
  async search(@Param() params: ClinicIdParamDto, @Query() query: SearchPatientsQueryDto) {
    return this.patientService.search(
      params.clinicId,
      query.q ?? '',
      Math.min(query.take ?? 50, 100),
    );
  }

  @Post(':patientId/portal-link')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_LINK)
  async linkPortal(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: LinkPortalDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.patientPortalService.linkPortalUser(
      params.clinicId,
      params.patientId,
      dto.userId,
      req.user.user.id,
      randomUUID(),
    );
  }

  @Get(':patientId/portal-link-candidates')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_LINK)
  async listPortalLinkCandidates(
    @Param() params: ClinicAndPatientParamsDto,
    @Query() query: SearchPatientsQueryDto,
  ) {
    return this.patientPortalService.listPortalLinkCandidates(
      params.clinicId,
      params.patientId,
      query.q,
    );
  }

  @Post(':patientId/portal-invite')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_LINK)
  async createPortalInvite(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() dto: CreatePatientPortalInviteDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.createPortalInvite(
      params.clinicId,
      params.patientId,
      dto,
      req.user.user.id,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Delete(':patientId/portal-invite/:inviteId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_LINK)
  async cancelPortalInvite(
    @Param() params: ClinicPatientInviteParamsDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.cancelPortalInvite(
      params.clinicId,
      params.patientId,
      params.inviteId,
      req.user.user.id,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get(':patientId/self-reports')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_SELF_REPORT_READ)
  async listSelfReports(@Param() params: ClinicAndPatientParamsDto) {
    return this.patientPortalService.listSelfReportsForStaff(params.patientId, params.clinicId);
  }
}
