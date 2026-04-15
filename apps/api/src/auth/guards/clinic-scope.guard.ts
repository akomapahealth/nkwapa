import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import {
  CLINIC_ID_SOURCE_KEY,
  CLINIC_SCOPED_KEY,
  ClinicIdSource,
} from '../decorators/clinic-scoped.decorator';

export interface ReqUserWithRoles {
  user: { id: string };
  roles: { clinicId: string | null; role: UserRole }[];
}

@Injectable()
export class ClinicScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isClinicScoped = this.reflector.getAllAndOverride<boolean>(CLINIC_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isClinicScoped) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: ReqUserWithRoles | undefined = request.user;

    if (!user?.roles) {
      throw new ForbiddenException('Forbidden');
    }

    const source = this.reflector.getAllAndOverride<ClinicIdSource | undefined>(
      CLINIC_ID_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    let clinicId: string | undefined;

    if (source) {
      if (source.type === 'param') {
        const key = source.paramKey ?? 'clinicId';
        clinicId = request.params?.[key];
      } else if (source.type === 'body') {
        const key = source.bodyKey ?? 'clinicId';
        clinicId = request.body?.[key];
      } else if (source.type === 'query') {
        const key = source.queryKey ?? 'clinicId';
        clinicId = request.query?.[key];
      } else if (source.type === 'header') {
        const key = (source.headerKey ?? 'x-clinic-id').toLowerCase();
        clinicId = request.headers?.[key];
      }
      clinicId = typeof clinicId === 'string' ? clinicId.trim() || undefined : undefined;
    } else {
      clinicId =
        request.params?.clinicId ??
        request.params?.id ??
        request.query?.clinicId ??
        request.headers?.['x-clinic-id'];
      clinicId = typeof clinicId === 'string' ? clinicId.trim() || undefined : undefined;
    }

    if (!clinicId) {
      throw new ForbiddenException('Clinic scope required');
    }

    const isSystemAdmin = user.roles.some((r) => r.role === UserRole.SYSTEM_ADMIN);
    if (isSystemAdmin) {
      return true;
    }

    const hasAccess = user.roles.some((r) => r.clinicId === clinicId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to clinic');
    }

    request.clinicId = clinicId;
    return true;
  }
}
