import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { lastValueFrom, defer, from, mergeMap } from 'rxjs';
import { getRequestId } from '../common/request-context';
import { PrismaRlsContext, PrismaService } from './prisma.service';

type RequestWithAuth = {
  clinicId?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: {
    user?: { id?: string };
    roles?: Array<{ clinicId: string | null; role: UserRole | string }>;
  };
};

@Injectable()
export class PrismaRlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    return defer(() =>
      from(this.buildRlsContext(request)).pipe(
        mergeMap((rlsContext) =>
          from(this.prisma.withRlsContext(rlsContext, () => lastValueFrom(next.handle() as never))),
        ),
      ),
    ) as unknown as ReturnType<CallHandler['handle']>;
  }

  private async buildRlsContext(request: RequestWithAuth): Promise<PrismaRlsContext> {
    const roles = request.user?.roles ?? [];
    const userId = request.user?.user?.id ?? null;
    const allowedClinicIds = [
      ...new Set(
        roles
          .map((role) => role.clinicId)
          .filter(
            (clinicId): clinicId is string => typeof clinicId === 'string' && clinicId.length > 0,
          ),
      ),
    ];
    const isSystemAdmin = roles.some(
      (role) => role.role === UserRole.SYSTEM_ADMIN && role.clinicId == null,
    );
    const supplementalClinicIds = await this.resolveSupplementalClinicIds(userId);
    const effectiveClinicIds = [...new Set([...allowedClinicIds, ...supplementalClinicIds])];
    const activeClinicId =
      request.clinicId ??
      this.readHeaderValue(request.headers['x-clinic-id']) ??
      effectiveClinicIds[0] ??
      null;

    const lookupClinicIds = isSystemAdmin
      ? activeClinicId
        ? [activeClinicId]
        : []
      : [
          ...new Set(
            [activeClinicId, ...effectiveClinicIds].filter((value): value is string =>
              Boolean(value),
            ),
          ),
        ];

    let organizationId: string | null = null;
    let zoneCode: string | null = null;

    if (lookupClinicIds.length > 0) {
      const clinics = await this.prisma.clinic.findMany({
        where: { id: { in: lookupClinicIds } },
        select: {
          id: true,
          organizationId: true,
          zoneCode: true,
        },
      });
      const clinicMap = new Map(clinics.map((clinic) => [clinic.id, clinic]));
      const activeClinic = activeClinicId ? clinicMap.get(activeClinicId) : null;
      organizationId = activeClinic?.organizationId ?? clinics[0]?.organizationId ?? null;
      zoneCode = activeClinic?.zoneCode ?? null;
    }

    return {
      requestId: getRequestId(request as never),
      userId,
      organizationId,
      clinicIds: isSystemAdmin ? [] : effectiveClinicIds,
      activeClinicId,
      zoneCode,
      isSystemAdmin,
    };
  }

  private async resolveSupplementalClinicIds(userId: string | null) {
    if (!userId) {
      return [];
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        phoneE164: true,
        portalPatient: {
          select: {
            primaryClinicId: true,
          },
        },
      },
    });

    const clinicIds = new Set<string>();
    if (user?.portalPatient?.primaryClinicId) {
      clinicIds.add(user.portalPatient.primaryClinicId);
    }

    const inviteMatchConditions = [];
    if (user?.email) {
      inviteMatchConditions.push({
        email: {
          equals: user.email,
          mode: 'insensitive' as const,
        },
      });
    }
    if (user?.phoneE164) {
      inviteMatchConditions.push({
        phoneE164: user.phoneE164,
      });
    }

    if (inviteMatchConditions.length === 0) {
      return [...clinicIds];
    }

    const invites = await this.prisma.patientPortalInvite.findMany({
      where: {
        status: 'PENDING',
        OR: inviteMatchConditions,
      },
      select: {
        clinicId: true,
      },
    });

    for (const invite of invites) {
      clinicIds.add(invite.clinicId);
    }

    return [...clinicIds];
  }

  private readHeaderValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
