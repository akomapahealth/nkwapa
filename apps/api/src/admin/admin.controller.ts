import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { AdminService } from './admin.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { UserRole } from '@prisma/client';
import { AssignRoleDto } from './dto/assign-role.dto';
import { MergePatientsDto } from './dto/merge-patients.dto';
import { PatientDuplicateService } from '../patients/patient-duplicate.service';
import { PatientMergeService } from '../patients/patient-merge.service';
import { ListDuplicateCandidatesQueryDto } from '../patients/dto/list-duplicate-candidates.query.dto';
import { ReviewDuplicatePairDto } from '../patients/dto/review-duplicate-pair.dto';
import type { ReqUserWithRoles } from '../auth/guards/rbac.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission(PERMISSIONS.CLINIC_MANAGE)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly patientDuplicateService: PatientDuplicateService,
    private readonly patientMergeService: PatientMergeService,
  ) {}

  @Get('users')
  async listUsers(
    @Query('status') status: string | undefined,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    return this.adminService.listUsers(actor, status);
  }

  @Get('users/:userId/roles')
  async getUserRoles(@Param('userId') userId: string, @Request() req: { user: ReqUserWithRoles }) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    return this.adminService.getUserRoles(actor, userId);
  }

  @Post('users/:userId/roles')
  async assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const clinicId = dto.clinicId === undefined || dto.clinicId === '' ? null : dto.clinicId;
    return this.adminService.assignRole(actor, userId, clinicId, dto.role as UserRole);
  }

  @Delete('users/:userId/roles')
  async removeRole(
    @Param('userId') userId: string,
    @Query('clinicId') clinicIdParam: string | undefined,
    @Query('role') roleParam: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const clinicId = clinicIdParam === undefined || clinicIdParam === '' ? null : clinicIdParam;
    const role = roleParam as UserRole;
    if (!roleParam || !Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Valid role query parameter is required');
    }
    return this.adminService.removeRole(
      actor,
      userId,
      clinicId,
      role,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  /**
   * Suspected duplicates across every clinic the caller can see.
   *
   * Read-only, and system-admin only: the service refuses an unscoped read from anyone else, and
   * row level security independently limits a clinic user's context to their own clinics. This
   * is where a pair spanning two clinics becomes visible at all, which is the case the
   * clinic-scoped route by definition cannot show.
   */
  @Get('patients/duplicates')
  async listDuplicates(
    @Query() query: ListDuplicateCandidatesQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.patientDuplicateService.listCandidates(
      { userId: req.user.user.id, roles: req.user.roles },
      { clinicId: null },
      query,
    );
  }

  /** Record a decision about a pair, including one that spans two clinics. */
  @Post('patients/duplicates/review')
  async reviewDuplicate(
    @Body() body: ReviewDuplicatePairDto,
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientDuplicateService.recordReview(
      { userId: req.user.user.id, roles: req.user.roles },
      { clinicId: null },
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  /**
   * Consolidate two charts. Irreversible, and system-admin only.
   *
   * `PatientMergeService` re-runs the same evaluation the preview showed and refuses on any
   * blocker, so a client that skips the preview is held to exactly the same safety checks.
   */
  @Post('patients/merge')
  async mergePatients(
    @Body() dto: MergePatientsDto,
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientMergeService.merge(
      { userId: req.user.user.id, roles: req.user.roles },
      dto.canonicalPatientId,
      dto.sourcePatientId,
      {
        portalLinkStrategy: dto.portalLinkStrategy,
        inviteStrategy: dto.inviteStrategy,
        expectedFingerprint: dto.previewFingerprint,
      },
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
