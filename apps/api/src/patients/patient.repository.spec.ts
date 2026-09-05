import { PatientRepository } from './patient.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  FIXTURE_PATIENT_CODE,
  FIXTURE_SOURCE_PATIENT_CODE,
  identityChartFixture,
} from '../testing/patient-identity-fixtures';

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

/*
  Canonical chart redirects.

  A merge does not delete the chart it retires; it leaves a tombstone carrying
  `mergedIntoPatientId` and hands the survivor an alias for the code it gave up. Everything the
  clinic already printed -- an appointment card, a referral letter, a patient's own memory of
  their code -- still names the retired chart, so every one of those lookups has to arrive at the
  surviving record rather than at a tombstone holding no history.

  This is the only path in the product that follows a pointer it read from the database, and it
  had no test at all.
*/
describe('PatientRepository - canonical chart redirects', () => {
  let findUnique: jest.Mock;
  let aliasFindUnique: jest.Mock;
  let repository: PatientRepository;

  /** Index charts by id so `findUnique` answers whichever one the recursion asks for. */
  function stubCharts(...charts: ReturnType<typeof identityChartFixture>[]) {
    const byId = new Map(charts.map((patient) => [patient.id, patient]));
    findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null,
    );
  }

  const live = () => identityChartFixture({ id: 'patient-live' });

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(null);
    aliasFindUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      patient: { findUnique },
      patientCodeAlias: { findUnique: aliasFindUnique },
    } as unknown as PrismaService;
    repository = new PatientRepository(prisma);
  });

  describe('findById', () => {
    it('returns a live chart untouched', async () => {
      stubCharts(live());

      await expect(repository.findById('patient-live', { resolveMerged: true })).resolves.toEqual(
        live(),
      );
    });

    it('returns the tombstone itself when resolution was not asked for', async () => {
      const tombstone = identityChartFixture({
        id: 'patient-old',
        mergedIntoPatientId: 'patient-live',
      });
      stubCharts(tombstone, live());

      const found = await repository.findById('patient-old');

      // The merge preview and the audit trail both need to read the retired chart as itself.
      expect(found?.id).toBe('patient-old');
      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('follows a tombstone to the chart that survived it', async () => {
      stubCharts(
        identityChartFixture({ id: 'patient-old', mergedIntoPatientId: 'patient-live' }),
        live(),
      );

      const found = await repository.findById('patient-old', { resolveMerged: true });

      expect(found?.id).toBe('patient-live');
    });

    // Charts are merged one pair at a time, so B into C after A into B leaves a two-hop chain.
    // The merge itself re-chains what it can see, but a chart merged before that behaviour
    // existed still points where it pointed.
    it('follows a chain of merges to the end', async () => {
      stubCharts(
        identityChartFixture({ id: 'patient-a', mergedIntoPatientId: 'patient-b' }),
        identityChartFixture({ id: 'patient-b', mergedIntoPatientId: 'patient-live' }),
        live(),
      );

      const found = await repository.findById('patient-a', { resolveMerged: true });

      expect(found?.id).toBe('patient-live');
    });

    it('returns null for an id that names no chart', async () => {
      await expect(
        repository.findById('patient-missing', { resolveMerged: true }),
      ).resolves.toBeNull();
    });
  });

  describe('findByPatientCode', () => {
    it('returns a live chart found by its own code', async () => {
      findUnique.mockImplementation(async ({ where }: { where: { patientCode?: string } }) =>
        where.patientCode === FIXTURE_PATIENT_CODE ? live() : null,
      );

      const found = await repository.findByPatientCode(FIXTURE_PATIENT_CODE);

      expect(found?.id).toBe('patient-live');
      expect(aliasFindUnique).not.toHaveBeenCalled();
    });

    it('follows a tombstone found by the code it still holds', async () => {
      const tombstone = identityChartFixture({
        id: 'patient-old',
        patientCode: FIXTURE_SOURCE_PATIENT_CODE,
        mergedIntoPatientId: 'patient-live',
      });
      findUnique.mockImplementation(
        async ({ where }: { where: { patientCode?: string; id?: string } }) => {
          if (where.patientCode === FIXTURE_SOURCE_PATIENT_CODE) return tombstone;
          if (where.id === 'patient-live') return live();
          return null;
        },
      );

      const found = await repository.findByPatientCode(FIXTURE_SOURCE_PATIENT_CODE);

      expect(found?.id).toBe('patient-live');
    });

    it('resolves a retired code through the alias the merge left behind', async () => {
      aliasFindUnique.mockResolvedValue({ code: FIXTURE_SOURCE_PATIENT_CODE, patient: live() });

      const found = await repository.findByPatientCode(FIXTURE_SOURCE_PATIENT_CODE);

      expect(found?.id).toBe('patient-live');
    });

    it('returns null when neither a chart nor an alias answers to the code', async () => {
      await expect(repository.findByPatientCode('NKP-2026-999999')).resolves.toBeNull();
    });
  });

  describe('findMany merge scope', () => {
    it('hides retired charts by default', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { patient: { findMany } } as unknown as PrismaService;

      await new PatientRepository(prisma).findMany({ primaryClinicId: 'clinic-1' });

      expect(findMany.mock.calls[0][0].where.mergedIntoPatientId).toBeNull();
    });

    it('includes them only when a caller asks', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { patient: { findMany } } as unknown as PrismaService;

      await new PatientRepository(prisma).findMany({
        primaryClinicId: 'clinic-1',
        includeMerged: true,
      });

      expect(findMany.mock.calls[0][0].where).not.toHaveProperty('mergedIntoPatientId');
    });
  });
});
