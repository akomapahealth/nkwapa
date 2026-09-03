import {
  PORTAL_INVITE_EXPIRY_BATCH_SIZE,
  PortalInviteExpiryService,
} from './portal-invite-expiry.service';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-09-02T12:00:00.000Z');

describe('PortalInviteExpiryService', () => {
  let prisma: {
    patientPortalInvite: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let auditService: { logWrite: jest.Mock };
  let service: PortalInviteExpiryService;

  beforeEach(() => {
    prisma = {
      patientPortalInvite: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };
    service = new PortalInviteExpiryService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  it('only selects pending invites whose expiry has passed', async () => {
    await service.expireOverdueInvites(NOW);

    expect(prisma.patientPortalInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING', expiresAt: { not: null, lte: NOW } },
        take: PORTAL_INVITE_EXPIRY_BATCH_SIZE,
      }),
    );
  });

  it('settles each overdue invite and audits it as the system actor', async () => {
    prisma.patientPortalInvite.findMany.mockResolvedValue([
      { id: 'invite-1', clinicId: 'clinic-1', expiresAt: new Date('2026-08-30T00:00:00.000Z') },
      { id: 'invite-2', clinicId: 'clinic-2', expiresAt: new Date('2026-08-31T00:00:00.000Z') },
    ]);

    const result = await service.expireOverdueInvites(NOW);

    expect(result).toEqual({ expired: 2 });
    expect(prisma.patientPortalInvite.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'invite-1', status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-1',
        actorUserId: SYSTEM_ACTOR_USER_ID,
        action: 'PATIENT.PORTAL.INVITE.EXPIRE',
        entityType: 'PatientPortalInvite',
        entityId: 'invite-1',
      }),
    );
  });

  // The update is guarded on PENDING, so an invite claimed between the select and the
  // write is left alone. Auditing it anyway would put an expiry event in the trail for a
  // transition that never happened, against a record that is now linked to a real person.
  it('does not record an expiry for an invite that was claimed mid-sweep', async () => {
    prisma.patientPortalInvite.findMany.mockResolvedValue([
      { id: 'invite-1', clinicId: 'clinic-1', expiresAt: new Date('2026-08-30T00:00:00.000Z') },
    ]);
    prisma.patientPortalInvite.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.expireOverdueInvites(NOW);

    expect(result).toEqual({ expired: 0 });
    expect(auditService.logWrite).not.toHaveBeenCalled();
  });

  it('writes nothing when there is nothing overdue', async () => {
    const result = await service.expireOverdueInvites(NOW);

    expect(result).toEqual({ expired: 0 });
    expect(prisma.patientPortalInvite.updateMany).not.toHaveBeenCalled();
    expect(auditService.logWrite).not.toHaveBeenCalled();
  });
});
