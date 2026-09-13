import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { lastValueFrom, defaultIfEmpty, defer, from, mergeMap, type Observable } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { getRequestId } from '../common/request-context';
import { PrismaRlsContext, PrismaService } from './prisma.service';
import { claimableInviteForIdentityWhere } from '../common/portal-invite-lifecycle';

/**
 * The tenant fields the chat handshake attaches to a socket.
 *
 * Structural rather than imported, so the Prisma layer does not depend on the chat module to know
 * how to scope a socket event.
 */
type SocketWithAuth = {
  data?: { auth?: { userId?: string; clinicId?: string } };
};

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
    if (context.getType() === 'ws') {
      return this.interceptWebSocket(context, next);
    }
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

  /**
   * Establish the tenant context for a WebSocket event.
   *
   * Nothing established a context for the realtime path, so `PrismaService`'s proxy handed back
   * the raw client with `app.current_clinic_ids` unset, and the chat tables are FORCE
   * row-level-security protected under policies gated on `app.can_access_clinic`. An empty context
   * evaluates false, so socket reads returned nothing and socket inserts were rejected.
   * Staff-to-staff messaging is sent only over the socket -- `ChatController` exposes no route for
   * it -- so the feature broke completely while conversation lists and history, which are REST,
   * kept loading. That is what made it look like a UI problem.
   *
   * This interceptor is registered as an `APP_INTERCEPTOR`, and that is *not* enough on its own:
   * a global enhancer bound that way is not applied to gateway handlers, which was confirmed by
   * instrumenting this method and watching a `message:send` reach the gateway without it running.
   * `ChatGateway` therefore binds it explicitly with `@UseInterceptors`. Binding it twice would be
   * harmless -- `withClinicContext` reuses a compatible active context rather than nesting -- but
   * binding it nowhere is the bug.
   *
   * `20260821120000_force_row_level_security` predicted exactly this in its own header: "Any code
   * path that queries a scoped table outside a request context must establish one explicitly."
   *
   * Handling it here rather than in the gateway is deliberate. A fix applied per handler is a fix
   * the next handler has to remember; this one covers every socket event that exists now and every
   * one added later.
   */
  private interceptWebSocket(
    context: ExecutionContext,
    next: CallHandler,
  ): ReturnType<CallHandler['handle']> {
    const client = context.switchToWs().getClient<SocketWithAuth>();
    const auth = client?.data?.auth;

    /*
      No auth data means the connection middleware refused the handshake, so there is no tenant to
      scope to. Passing the event through unchanged leaves it exactly as unprivileged as it was --
      every query it could make is still refused by row level security, which is the safe direction.
    */
    const clinicId = auth?.clinicId;
    const userId = auth?.userId;
    if (!clinicId || !userId) {
      return next.handle();
    }

    return defer(() =>
      from(
        this.prisma.withClinicContext(clinicId, { requestId: randomUUID(), userId }, () =>
          lastValueFrom(
            /*
                A socket handler usually returns nothing, and `lastValueFrom` rejects on an
                observable that completes without emitting.
              */
            (next.handle() as never as Observable<unknown>).pipe(defaultIfEmpty(undefined)),
          ),
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
    const supplementalClinicIds = await this.resolveSupplementalClinicIds(
      userId,
      getRequestId(request as never),
    );
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
      // Bootstrap read: this runs before the request's own context exists, and Clinic is
      // row-level-security scoped, so it needs an explicit system context to resolve the very
      // organization the request will then be scoped to.
      const clinics = await this.prisma.withSystemContext(
        {
          requestId: getRequestId(request as never),
          userId,
          systemReason: 'Resolve the tenant context for an inbound request',
        },
        (tx) =>
          tx.clinic.findMany({
            where: { id: { in: lookupClinicIds } },
            select: {
              id: true,
              organizationId: true,
              zoneCode: true,
            },
          }),
      );
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

  private async resolveSupplementalClinicIds(userId: string | null, requestId?: string) {
    if (!userId) {
      return [];
    }

    // Also a bootstrap read. `portalPatient` traverses into Patient and the invite lookup reads
    // PatientPortalInvite, both scoped, and neither is reachable until the clinics they would
    // grant have been resolved.
    return this.prisma.withSystemContext(
      {
        requestId,
        userId,
        systemReason: 'Resolve portal clinic access for an inbound request',
      },
      async (tx) => this.collectSupplementalClinicIds(tx, userId),
    );
  }

  private async collectSupplementalClinicIds(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findUnique({
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

    // An expired invite must widen nothing. This matched on status alone, so an invite
    // staged a year ago still handed its clinic to whoever held the address it was sent
    // to — a tenant boundary decided by a column nothing read.
    const claimable = claimableInviteForIdentityWhere(user ?? {}, new Date());
    if (!claimable) {
      return [...clinicIds];
    }

    const invites = await tx.patientPortalInvite.findMany({
      where: claimable,
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
