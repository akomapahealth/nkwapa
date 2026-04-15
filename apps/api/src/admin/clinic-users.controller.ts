import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { AdminService } from './admin.service';

@Controller('clinics/:clinicId/users')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicUsersController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  async listClinicUsers(
    @Param('clinicId') clinicId: string,
    @Query('status') status: string | undefined,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.adminService.listClinicUsers(
      {
        userId: req.user.user.id,
        roles: req.user.roles,
      },
      clinicId,
      status,
    );
  }

  @Patch(':userId/deactivate')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  async deactivateUser(
    @Param('clinicId') clinicId: string,
    @Param('userId') userId: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.adminService.deactivateUserInClinic(
      {
        userId: req.user.user.id,
        roles: req.user.roles,
      },
      clinicId,
      userId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Delete(':userId/roles/:role')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  async revokeClinicRole(
    @Param('clinicId') clinicId: string,
    @Param('userId') userId: string,
    @Param('role') roleParam: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    const role = roleParam as UserRole;
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Valid role path parameter is required');
    }

    return this.adminService.revokeClinicRole(
      {
        userId: req.user.user.id,
        roles: req.user.roles,
      },
      clinicId,
      userId,
      role,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
