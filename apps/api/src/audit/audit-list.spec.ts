import { AuditService } from './audit.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditService.list actor search', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const service = new AuditService({ auditEvent: { findMany } } as unknown as PrismaService);
  const where = () => findMany.mock.calls.at(-1)?.[0].where;

  beforeEach(() => findMany.mockClear());

  it('matches part of the actor name or email, ignoring case', async () => {
    await service.list({ clinicId: 'clinic-1', actorSearch: '  ama ' });

    expect(where()).toEqual({
      clinicId: 'clinic-1',
      actor: {
        OR: [
          { displayName: { contains: 'ama', mode: 'insensitive' } },
          { email: { contains: 'ama', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('ignores a blank search, and keeps the clinic scope beside it', async () => {
    await service.list({ clinicId: 'clinic-1', actorSearch: '   ', action: 'PATIENT.UPDATE' });

    expect(where()).toEqual({ clinicId: 'clinic-1', action: 'PATIENT.UPDATE' });
  });
});
