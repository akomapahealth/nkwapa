import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { hasPermission } from '../constants/permissions';
import { rolesForClinic } from '../clinic-roles';

export interface ReqUserWithRoles {
  user: { id: string };
  roles: { clinicId: string | null; role: UserRole }[];
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: ReqUserWithRoles | undefined = request.user;

    if (!user?.roles?.length) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const clinicId = request.clinicId as string | undefined;
    const rolesToCheck = rolesForClinic(user.roles, clinicId);

    const allowed = hasPermission(rolesToCheck, requiredPermission);

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
