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
import { PatientDuplicateService } from '../patients/patient-duplicate.service';
import { PatientMergeService } from '../patients/patient-merge.service';
import { PatientPortalService } from '../patient-portal/patient-portal.service';
import { CreatePatientBodyDto } from '../patients/dto/create-patient-body.dto';
import { ListPatientRegistryQueryDto } from '../patients/dto/list-patient-registry.query.dto';
import { ListDuplicateCandidatesQueryDto } from '../patients/dto/list-duplicate-candidates.query.dto';
import { ReviewDuplicatePairDto } from '../patients/dto/review-duplicate-pair.dto';
import { MergePreviewQueryDto } from '../patients/dto/merge-preview.query.dto';
import { LinkPortalDto } from '../patient-portal/dto/link-portal.dto';
import { CreatePatientPortalInviteDto } from '../patient-portal/dto/portal-invite.dto';
import { UpdatePatientBodyDto } from '../patients/dto/update-patient-body.dto';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
import {
  ClinicAndPatientParamsDto,
  ClinicPatientInviteParamsDto,
  ClinicIdParamDto,
} from '../common/request-dto';
import { ToOptionalNumber, ToSanitizedString } from '../common/validation';
import type { ReqUserWithRoles } from '../auth/guards/rbac.guard';

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
    private readonly patientDuplicateService: PatientDuplicateService,
    private readonly patientMergeService: PatientMergeService,
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

  /**
   * This clinic's suspected duplicate charts.
   *
   * Read-only. Candidates are computed from columns that already exist and nothing is written,
   * so this route can be opened as often as an operator likes without consequence.
   */
  @Get('duplicates')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DUPLICATE_REVIEW)
  async listDuplicates(
    @Param() params: ClinicIdParamDto,
    @Query() query: ListDuplicateCandidatesQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.patientDuplicateService.listCandidates(
      { userId: req.user.user.id, roles: req.user.roles },
      { clinicId: params.clinicId },
      query,
    );
  }

  /**
   * Record a decision about one pair.
   *
   * The only write on this surface, and it writes to PatientDuplicateReview alone. Merging two
   * charts remains POST /admin/patients/merge, which stays system-admin only.
   */
  @Post('duplicates/review')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DUPLICATE_REVIEW)
  async reviewDuplicate(
    @Param() params: ClinicIdParamDto,
    @Body() body: ReviewDuplicatePairDto,
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientDuplicateService.recordReview(
      { userId: req.user.user.id, roles: req.user.roles },
      { clinicId: params.clinicId },
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  /**
   * What merging `sourcePatientId` into this chart would do.
   *
   * Read-only, and system-admin only: PATIENT.MERGE is held by no role except through
   * SYSTEM_ADMIN's wildcard, and `PatientMergeService` asserts the seat again below the guard.
   * It lives here rather than only under /admin because this is the chart the operator is
   * looking at, so the request carries the clinic and `ClinicScopeGuard` can narrow it.
   */
  @Get(':patientId/merge-preview')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_MERGE)
  async previewMerge(
    @Param() params: ClinicAndPatientParamsDto,
    @Query() query: MergePreviewQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.patientMergeService.preview(
      { userId: req.user.user.id, roles: req.user.roles },
      params.patientId,
      query.sourcePatientId,
      {
        portalLinkStrategy: query.portalLinkStrategy,
        inviteStrategy: query.inviteStrategy,
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

  @Post(':patientId/portal-invite/:inviteId/resend')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_PORTAL_LINK)
  @RateLimit({ key: 'portal_invite_resend', limit: 5, windowSeconds: 600, scope: 'user' })
  async resendPortalInvite(
    @Param() params: ClinicPatientInviteParamsDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.resendPortalInvite(
      params.clinicId,
      params.patientId,
      params.inviteId,
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
