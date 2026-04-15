import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
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
  async listAll(@Request() req: { user: ReqUserWithRoles }) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );
    const isDirector = actor.roles.some((r) => r.role === UserRole.DIRECTOR);
    if (!isSystemAdmin && !isDirector) {
      throw new ForbiddenException('Insufficient permissions to list clinics');
    }
    return this.clinicService.listAllForAdmin(actor);
  }

  @Post()
  async create(@Body() dto: CreateClinicAdminDto, @Request() req: { user: ReqUserWithRoles }) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );
    const isDirector = actor.roles.some((r) => r.role === UserRole.DIRECTOR);
    if (!isSystemAdmin && !isDirector) {
      throw new ForbiddenException('Insufficient permissions to create clinic');
    }
    const clinic = await this.clinicService.create({
      name: dto.name,
      region: dto.region,
      countryCode: dto.countryCode,
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
    @Param('id') id: string,
    @Body() dto: UpdateClinicAdminDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
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
      isActive: dto.isActive,
    });
  }
}
