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
import type { ReqUserWithRoles } from '../auth/guards/rbac.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission(PERMISSIONS.CLINIC_MANAGE)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers(
    @Query('status') status: string | undefined,
    @Request() req: { user: ReqUserWithRoles }
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    return this.adminService.listUsers(actor, status);
  }

  @Get('users/:userId/roles')
  async getUserRoles(
    @Param('userId') userId: string,
    @Request() req: { user: ReqUserWithRoles }
  ) {
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
    @Request() req: { user: ReqUserWithRoles }
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const clinicId =
      dto.clinicId === undefined || dto.clinicId === ''
        ? null
        : dto.clinicId;
    return this.adminService.assignRole(
      actor,
      userId,
      clinicId,
      dto.role as UserRole
    );
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
    }
  ) {
    const actor = {
      userId: req.user.user.id,
      roles: req.user.roles,
    };
    const clinicId =
      clinicIdParam === undefined || clinicIdParam === '' ? null : clinicIdParam;
    const role = roleParam as UserRole;
    if (!roleParam || !Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Valid role query parameter is required');
    }
    return this.adminService.removeRole(
      actor,
      userId,
      clinicId,
      role,
      req.headers?.['x-request-id'] ?? randomUUID()
    );
  }
}
