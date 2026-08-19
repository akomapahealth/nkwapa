import { PatientRepository } from './patient.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('PatientRepository - residential location filters', () => {
  let findMany: jest.Mock;
  let repository: PatientRepository;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    const prisma = { patient: { findMany } } as unknown as PrismaService;
    repository = new PatientRepository(prisma);
  });

  function whereOf(): Record<string, unknown> {
    return findMany.mock.calls[0][0].where as Record<string, unknown>;
  }

  it('always scopes to the clinic even with location filters (cross-clinic isolation)', async () => {
    await repository.findMany({
      primaryClinicId: 'clinic-1',
      residentialRegion: 'GREATER_ACCRA',
    });

    const where = whereOf();
    expect(where.primaryClinicId).toBe('clinic-1');
    expect(where.residentialRegion).toBe('GREATER_ACCRA');
    // Location filters must be AND-ed, never expressed as an OR that could widen scope.
    expect(where.OR).toBeUndefined();
  });

  it('applies region and status as equality filters', async () => {
    await repository.findMany({
      primaryClinicId: 'clinic-1',
      residentialRegion: 'ASHANTI',
      residentialLocationStatus: 'UNKNOWN',
    });

    const where = whereOf();
    expect(where.residentialRegion).toBe('ASHANTI');
    expect(where.residentialLocationStatus).toBe('UNKNOWN');
  });

  it('applies district and community as case-insensitive contains filters', async () => {
    await repository.findMany({
      primaryClinicId: 'clinic-1',
      residentialDistrict: ' Bekwai ',
      residentialCommunity: 'osu',
    });

    const where = whereOf();
    expect(where.residentialDistrict).toEqual({ contains: 'Bekwai', mode: 'insensitive' });
    expect(where.residentialCommunity).toEqual({ contains: 'osu', mode: 'insensitive' });
  });

  it('keeps location filters alongside a text search, still clinic-scoped', async () => {
    await repository.findMany({
      primaryClinicId: 'clinic-1',
      search: 'Ama',
      residentialRegion: 'VOLTA',
    });

    const where = whereOf();
    expect(where.primaryClinicId).toBe('clinic-1');
    expect(where.residentialRegion).toBe('VOLTA');
    expect(Array.isArray(where.OR)).toBe(true);
  });
});
