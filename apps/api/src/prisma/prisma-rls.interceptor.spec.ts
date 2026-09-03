import { lastValueFrom, of } from 'rxjs';
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
