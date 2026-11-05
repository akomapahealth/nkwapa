import {
  INVITE_RENEWAL_COOLDOWN_MS,
  INVITE_RENEWAL_RECEIVED,
  InviteRenewalService,
  shouldFlagRenewal,
} from './invite-renewal.service';

const NOW = new Date('2026-11-05T12:00:00Z');
const PAST = new Date('2026-11-01T12:00:00Z');
const FUTURE = new Date('2026-11-09T12:00:00Z');

/** "Ask for a new invitation" (#307, B7). */
describe('shouldFlagRenewal', () => {
  const invite = (overrides: Record<string, unknown> = {}) => ({
    status: 'EXPIRED',
    expiresAt: PAST,
    renewalRequestedAt: null,
    ...overrides,
  });

  it('flags a lapsed invitation, swept or not yet swept', () => {
    expect(shouldFlagRenewal(invite(), NOW)).toBe(true);
    expect(shouldFlagRenewal(invite({ status: 'PENDING' }), NOW)).toBe(true);
  });

  it('never flags a live, claimed, accepted or withdrawn invitation', () => {
    expect(shouldFlagRenewal(invite({ status: 'PENDING', expiresAt: FUTURE }), NOW)).toBe(false);
    for (const status of ['CLAIMED', 'ACCEPTED', 'CANCELLED']) {
      expect(shouldFlagRenewal(invite({ status }), NOW)).toBe(false);
    }
    expect(shouldFlagRenewal(null, NOW)).toBe(false);
  });

  it('flags at most once a day', () => {
    const recent = new Date(NOW.getTime() - INVITE_RENEWAL_COOLDOWN_MS + 60_000);
    const old = new Date(NOW.getTime() - INVITE_RENEWAL_COOLDOWN_MS);
    expect(shouldFlagRenewal(invite({ renewalRequestedAt: recent }), NOW)).toBe(false);
    expect(shouldFlagRenewal(invite({ renewalRequestedAt: old }), NOW)).toBe(true);
  });
});

describe('InviteRenewalService', () => {
  function setup({
    user = { email: 'Ama@Example.com', isActive: true } as {
      email: string | null;
      isActive: boolean;
    } | null,
    portal = null as Record<string, unknown> | null,
    staff = null as Record<string, unknown> | null,
  } = {}) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      patientPortalInvite: {
        findFirst: jest.fn().mockResolvedValue(portal),
        update: jest.fn(),
      },
      staffInvite: { findFirst: jest.fn().mockResolvedValue(staff), update: jest.fn() },
    };
    const audit = { logWrite: jest.fn() };
    return { prisma, audit, service: new InviteRenewalService(prisma as never, audit as never) };
  }
  const lapsed = (id: string) => ({
    id,
    clinicId: 'clinic-1',
    status: 'EXPIRED',
    expiresAt: PAST,
    renewalRequestedAt: null,
  });

  it('marks the latest lapsed portal invitation for the verified email, and audits it', async () => {
    const { prisma, audit, service } = setup({ portal: lapsed('pinv-1') });
    await expect(service.requestRenewal('user-1', 'req-1', NOW)).resolves.toEqual(
      INVITE_RENEWAL_RECEIVED,
    );
    expect(prisma.patientPortalInvite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'ama@example.com', mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(prisma.patientPortalInvite.update).toHaveBeenCalledWith({
      where: { id: 'pinv-1' },
      data: { renewalRequestedAt: NOW },
    });
    expect(audit.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATIENT.PORTAL.INVITE.RENEWAL_REQUEST',
        clinicId: 'clinic-1',
        entityId: 'pinv-1',
      }),
    );
    // No address in the audit trail; it is already on the invitation.
    expect(JSON.stringify(audit.logWrite.mock.calls)).not.toContain('example.com');
  });

  it('marks a lapsed staff invitation the same way', async () => {
    const { prisma, service } = setup({ staff: lapsed('sinv-1') });
    await service.requestRenewal('user-1', 'req-1', NOW);
    expect(prisma.staffInvite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ama@example.com' } }),
    );
    expect(prisma.staffInvite.update).toHaveBeenCalledWith({
      where: { id: 'sinv-1' },
      data: { renewalRequestedAt: NOW, removedAt: null },
    });
  });

  it.each([
    ['no invitation at all', {}],
    [
      'an invitation that is still live',
      { portal: { ...lapsed('p'), status: 'PENDING', expiresAt: FUTURE } },
    ],
    ['a withdrawn invitation', { staff: { ...lapsed('s'), status: 'CANCELLED' } }],
    ['no verified email', { user: { email: null, isActive: true }, portal: lapsed('p') }],
    ['a deactivated account', { user: { email: 'a@b.c', isActive: false }, portal: lapsed('p') }],
  ])('says the same thing and writes nothing for %s', async (_case, options) => {
    const { prisma, audit, service } = setup(options as never);
    await expect(service.requestRenewal('user-1', 'req-1', NOW)).resolves.toEqual(
      INVITE_RENEWAL_RECEIVED,
    );
    expect(prisma.patientPortalInvite.update).not.toHaveBeenCalled();
    expect(prisma.staffInvite.update).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
  });
});
