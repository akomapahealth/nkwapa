import { EMPTY, lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { PrismaRlsInterceptor } from './prisma-rls.interceptor';
import type { PrismaService } from './prisma.service';

/**
 * The tenant boundary this interceptor draws is partly decided by portal invites: an
 * invite staged to someone's email widens their RLS clinic set so the claim flow can read
 * the chart it points at. That widening used to match on status alone, so an invite issued
 * a year ago still handed out its clinic — a tenant boundary decided by a column no code
 * read. These tests exist so that cannot come back.
 */
describe('PrismaRlsInterceptor supplemental clinic access', () => {
  const buildContext = () =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          user: { user: { id: 'user-1' }, roles: [] },
        }),
      }),
    }) as unknown as ExecutionContext;

  const buildHandler = (): CallHandler => ({ handle: () => of('ok') });

  function buildPrisma(user: { email: string | null; phoneE164: string | null } | null) {
    const findMany = jest.fn().mockResolvedValue([{ clinicId: 'clinic-9' }]);
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user && { ...user, portalPatient: null }),
      },
      patientPortalInvite: { findMany },
      // A second bootstrap read runs once a supplemental clinic has been resolved, to
      // find the organization the request will be scoped to.
      clinic: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      withSystemContext: jest.fn(
        async (_ctx: unknown, run: (client: typeof tx) => Promise<unknown>) => run(tx),
      ),
      withRlsContext: jest.fn(async (_ctx: unknown, run: () => Promise<unknown>) => run()),
    } as unknown as PrismaService;
    return { prisma, findMany };
  }

  it('only widens scope from an invite that is still claimable', async () => {
    const { prisma, findMany } = buildPrisma({ email: 'ama@example.com', phoneE164: null });
    const interceptor = new PrismaRlsInterceptor(prisma);

    await lastValueFrom(interceptor.intercept(buildContext(), buildHandler()));

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
          { OR: [{ email: { equals: 'ama@example.com', mode: 'insensitive' } }] },
        ],
      },
      select: { clinicId: true },
    });
  });

  // An empty OR matches every row. Querying at all for a user with no contact details
  // would hand them every clinic that has ever issued an invite.
  it('does not query invites at all for a user with no contact details', async () => {
    const { prisma, findMany } = buildPrisma({ email: null, phoneE164: null });
    const interceptor = new PrismaRlsInterceptor(prisma);

    await lastValueFrom(interceptor.intercept(buildContext(), buildHandler()));

    expect(findMany).not.toHaveBeenCalled();
  });
});

/**
 * The realtime path had no tenant context at all, and that is why staff chat stopped working.
 *
 * This interceptor is global, so it already ran for every socket event -- and returned early,
 * because it only understood HTTP. `PrismaService`'s proxy then handed back the raw client with
 * `app.current_clinic_ids` unset, and the chat tables are FORCE row-level-security protected under
 * policies gated on `app.can_access_clinic`, which evaluates false against an empty context. Socket
 * reads returned nothing and socket inserts were rejected.
 *
 * Sending a message is socket-only -- `ChatController` exposes no route for it -- so the feature
 * broke completely while the REST conversation list and history kept working, which is what made it
 * look like a UI bug.
 */
describe('PrismaRlsInterceptor on the realtime path', () => {
  const socketContext = (auth: unknown) =>
    ({
      getType: () => 'ws',
      switchToWs: () => ({ getClient: () => ({ data: { auth } }) }),
    }) as unknown as ExecutionContext;

  function buildPrisma() {
    const withClinicContext = jest.fn(
      async (_clinicId: string, _ctx: unknown, run: () => Promise<unknown>) => run(),
    );
    return {
      prisma: { withClinicContext } as unknown as PrismaService,
      withClinicContext,
    };
  }

  it('scopes a socket event to the clinic the handshake was authorised for', async () => {
    const { prisma, withClinicContext } = buildPrisma();
    const interceptor = new PrismaRlsInterceptor(prisma);

    const result = await lastValueFrom(
      interceptor.intercept(socketContext({ userId: 'user-1', clinicId: 'clinic-1' }), {
        handle: () => of('sent'),
      }) as never,
    );

    expect(withClinicContext).toHaveBeenCalledWith(
      'clinic-1',
      expect.objectContaining({ userId: 'user-1' }),
      expect.any(Function),
    );
    expect(result).toBe('sent');
  });

  /*
    A socket handler usually returns nothing, and `lastValueFrom` rejects on an observable that
    completes without emitting. Every chat handler but one returns void, so getting this wrong
    would turn the fix into a different silent failure.
  */
  it('completes for a handler that returns nothing', async () => {
    const { prisma } = buildPrisma();
    const interceptor = new PrismaRlsInterceptor(prisma);

    await expect(
      lastValueFrom(
        interceptor.intercept(socketContext({ userId: 'user-1', clinicId: 'clinic-1' }), {
          handle: () => EMPTY,
        }) as never,
      ),
    ).resolves.toBeUndefined();
  });

  /*
    An unauthenticated socket is passed through rather than given a context.

    There is no tenant to scope to, and leaving the event unprivileged means row level security
    still refuses every query it could make -- the safe direction.
  */
  it.each([
    ['no auth data at all', undefined],
    ['a clinic but no user', { clinicId: 'clinic-1' }],
    ['a user but no clinic', { userId: 'user-1' }],
  ])('does not invent a context from %s', async (_label, auth) => {
    const { prisma, withClinicContext } = buildPrisma();
    const interceptor = new PrismaRlsInterceptor(prisma);

    const result = await lastValueFrom(
      interceptor.intercept(socketContext(auth), { handle: () => of('passed through') }) as never,
    );

    expect(withClinicContext).not.toHaveBeenCalled();
    expect(result).toBe('passed through');
  });

  /*
    The regression, stated directly.

    Restoring the early return for 'ws' -- by reordering the branches, or by widening the
    not-http guard -- puts every socket event back outside a tenant context, which is the bug.
  */
  it('never hands a socket event straight through when it could be scoped', async () => {
    const { prisma, withClinicContext } = buildPrisma();
    const interceptor = new PrismaRlsInterceptor(prisma);
    const handle = jest.fn(() => of('ok'));

    await lastValueFrom(
      interceptor.intercept(socketContext({ userId: 'u', clinicId: 'c' }), { handle }) as never,
    );

    expect(withClinicContext).toHaveBeenCalledTimes(1);
    // The handler ran inside the context callback, not before it.
    expect(withClinicContext.mock.invocationCallOrder[0]).toBeLessThan(
      handle.mock.invocationCallOrder[0],
    );
  });

  /* A context this interceptor does not understand is still passed through untouched. */
  it('leaves a non-http, non-ws context alone', async () => {
    const { prisma, withClinicContext } = buildPrisma();
    const interceptor = new PrismaRlsInterceptor(prisma);

    const result = await lastValueFrom(
      interceptor.intercept({ getType: () => 'rpc' } as unknown as ExecutionContext, {
        handle: () => of('rpc'),
      }) as never,
    );

    expect(withClinicContext).not.toHaveBeenCalled();
    expect(result).toBe('rpc');
  });
});
