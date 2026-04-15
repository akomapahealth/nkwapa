import { Controller, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { AdminService } from './admin.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RbacGuard)
export class UsersLifecycleController {
  constructor(private readonly adminService: AdminService) {}

  @Patch(':userId/deactivate')
  async deactivateUser(
    @Param('userId') userId: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.adminService.deactivateUserGlobally(
      {
        userId: req.user.user.id,
        roles: req.user.roles,
      },
      userId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
