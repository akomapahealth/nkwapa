import { Controller, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
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

  @Patch(':userId/reactivate')
  async reactivateUser(
    @Param('userId') userId: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.adminService.reactivateUserGlobally(
      { userId: req.user.user.id, roles: req.user.roles },
      userId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  /** Bring the sign-in identity back in line with the account, whichever way it points. */
  @Post(':userId/identity/sync')
  async syncIdentity(
    @Param('userId') userId: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.adminService.retryIdentitySync(
      { userId: req.user.user.id, roles: req.user.roles },
      userId,
      null,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
