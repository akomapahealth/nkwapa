import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicService } from './clinic.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicAdminDto } from './dto/create-clinic-admin.dto';
import { UpdateClinicAdminDto } from './dto/update-clinic-admin.dto';
import { ListClinicsAdminQueryDto } from './dto/list-clinics-admin.query.dto';
import { IdParamDto } from '../common/request-dto';
import type { ReqUserWithRoles } from '../auth/guards/rbac.guard';

@Controller('admin/clinics')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission(PERMISSIONS.CLINIC_MANAGE)
export class ClinicsAdminController {
  constructor(
    private readonly clinicService: ClinicService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listAll(
    @Request() req: { user: ReqUserWithRoles },
    @Query() query: ListClinicsAdminQueryDto,
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    this.assertCanAdministerClinics(actor.roles, 'list clinics');
    return this.clinicService.listAllForAdmin(actor, { zoneCode: query.zoneCode });
  }

  /**
   * The zones in use across the clinics this actor administers.
   *
   * Zones are tenant-defined free text rather than an enum, so the filter's vocabulary has to
   * come from the data. Scoped exactly like the list beside it: a director sees the zones of
   * the clinics they direct, and learns nothing about how anyone else is organized.
   */
  @Get('zones')
  async listZones(@Request() req: { user: ReqUserWithRoles }) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    this.assertCanAdministerClinics(actor.roles, 'list zones');
    return this.clinicService.listZonesForActor(actor);
  }

  /**
   * The organizations a clinic can be filed under.
   *
   * Read-only on purpose. Organization onboarding is out of scope here, so this exists only
   * so the create form can name an existing organization rather than guessing one.
   */
  @Get('organizations')
  async listOrganizations(@Request() req: { user: ReqUserWithRoles }) {
    this.assertCanAdministerClinics(req.user.roles, 'list organizations');
    return this.clinicService.listOrganizations({
      userId: req.user.user.id,
      roles: req.user.roles,
    });
  }

  @Post()
  async create(@Body() dto: CreateClinicAdminDto, @Request() req: { user: ReqUserWithRoles }) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const { isSystemAdmin, isDirector } = this.assertCanAdministerClinics(
      actor.roles,
      'create clinic',
    );
    /*
      Resolved against the actor, not taken from the body. Creating grants a director the
      directorship of what they created, so letting one name any organization's id would be a
      way into another tenant.
    */
    const organizationId = await this.clinicService.resolveOrganizationIdForActor(
      actor,
      dto.organizationId,
    );
    const clinic = await this.clinicService.create({
      name: dto.name,
      region: dto.region,
      countryCode: dto.countryCode,
      organizationId,
      timezone: dto.timezone,
      locationCode: dto.locationCode,
      zoneCode: dto.zoneCode,
    });
    if (isDirector && !isSystemAdmin) {
      await this.prisma.userClinicRole.create({
        data: {
          userId: actor.userId,
          clinicId: clinic.id,
          role: UserRole.DIRECTOR,
        },
      });
    }
    return clinic;
  }

  @Put(':id')
  async update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateClinicAdminDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    const { id } = params;
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const canManage = await this.clinicService.canManageClinic(actor, id);
    if (!canManage) {
      throw new ForbiddenException('Access denied to clinic');
    }
    const existing = await this.clinicService.findByIdForAdmin(id);
    if (!existing) {
      throw new NotFoundException('Clinic not found');
    }
    return this.clinicService.update(id, {
      name: dto.name,
      region: dto.region,
      countryCode: dto.countryCode,
      timezone: dto.timezone,
      locationCode: dto.locationCode,
      zoneCode: dto.zoneCode,
      isActive: dto.isActive,
    });
  }

  /**
   * CLINIC.MANAGE is also held by Managers, so the guard alone would let one through.
   * Clinic administration is Director and System Admin only, and this is the gate that
   * enforces it -- the two existing specs pin that behaviour.
   */
  private assertCanAdministerClinics(roles: ReqUserWithRoles['roles'], action: string) {
    const isSystemAdmin = roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );
    const isDirector = roles.some((r) => r.role === UserRole.DIRECTOR);
    if (!isSystemAdmin && !isDirector) {
      throw new ForbiddenException(`Insufficient permissions to ${action}`);
    }
    return { isSystemAdmin, isDirector };
  }
}
