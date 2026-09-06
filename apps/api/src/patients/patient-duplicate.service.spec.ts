import { ForbiddenException } from '@nestjs/common';
import { PatientDuplicateReviewStatus, UserRole } from '@prisma/client';
import { DUPLICATE_MATCH_WEIGHTS, duplicatePairKey } from '@nkwapa/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PatientDuplicateRepository,
  type DuplicatePatientRecord,
} from './patient-duplicate.repository';
import { PatientDuplicateService, type DuplicateReviewActor } from './patient-duplicate.service';
import { DUPLICATE_PAIR_SCAN_LIMIT } from './patient-duplicate.repository';
import { DUPLICATE_COMBINED_CASE, DUPLICATE_RULE_CASES } from '../testing/patient-identity-matrix';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';

function chart(overrides: Partial<DuplicatePatientRecord> = {}): DuplicatePatientRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    patientCode: 'NKP-2026-000001',
    firstName: 'Ama',
    lastName: 'Mensah',
    dob: new Date('1990-05-15T00:00:00.000Z'),
    sex: 'FEMALE',
    phoneE164: null,
    email: null,
    nationalIdHash: null,
    nationalIdType: 'NATIONAL_ID',
    nationalIdLast4: null,
    primaryClinicId: CLINIC_A,
    portalUserId: null,
    mergedIntoPatientId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    primaryClinic: {
      id: CLINIC_A,
      name: 'Nkwapa Clinic - Demo',
      organizationId: 'org-1',
      organization: { name: 'Nkwapa Health' },
    },
    ...overrides,
  } as DuplicatePatientRecord;
}

const systemAdmin: DuplicateReviewActor = {
  userId: 'user-admin',
  roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
};

const clinicManager: DuplicateReviewActor = {
  userId: 'user-manager',
  roles: [{ clinicId: CLINIC_A, role: UserRole.MANAGER }],
};

function createService(
  overrides: {
    pairs?: { patientAId: string; patientBId: string }[];
    patients?: DuplicatePatientRecord[];
    reviews?: unknown[];
  } = {},
) {
  const findCandidatePairs = jest.fn().mockResolvedValue(overrides.pairs ?? []);
  const findPatientsByIds = jest.fn().mockResolvedValue(overrides.patients ?? []);
  const findReviewsByPairKeys = jest.fn().mockResolvedValue(overrides.reviews ?? []);

  const repository = {
    findCandidatePairs,
    findPatientsByIds,
    findReviewsByPairKeys,
  } as unknown as PatientDuplicateRepository;

  const upsert = jest.fn();
  const reviewFindUnique = jest.fn().mockResolvedValue(null);
  const prisma = {
    patientDuplicateReview: {
      findUnique: reviewFindUnique,
      upsert,
    },
  } as unknown as PrismaService;

  const logWrite = jest.fn();
  const audit = { logWrite } as unknown as AuditService;

  return {
    service: new PatientDuplicateService(prisma, repository, audit),
    findCandidatePairs,
    findPatientsByIds,
    upsert,
    reviewFindUnique,
    logWrite,
  };
}

describe('PatientDuplicateService.listCandidates', () => {
  it('scopes candidate generation to the requested clinic', async () => {
    const { service, findCandidatePairs } = createService();

    await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(findCandidatePairs).toHaveBeenCalledWith({ clinicId: CLINIC_A });
  });

  it('refuses the all-clinics scope to anyone but a system admin', async () => {
    const { service, findCandidatePairs } = createService();

    await expect(service.listCandidates(clinicManager, { clinicId: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findCandidatePairs).not.toHaveBeenCalled();
  });

  it('refuses a clinic-scoped role that only holds SYSTEM_ADMIN at a clinic', async () => {
    const { service } = createService();
    const impostor: DuplicateReviewActor = {
      userId: 'user-x',
      roles: [{ clinicId: CLINIC_A, role: UserRole.SYSTEM_ADMIN }],
    };

    await expect(service.listCandidates(impostor, { clinicId: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets a system admin scan every visible clinic', async () => {
    const { service, findCandidatePairs } = createService();

    await service.listCandidates(systemAdmin, { clinicId: null });

    expect(findCandidatePairs).toHaveBeenCalledWith({ clinicId: null });
  });

  it('surfaces a same-name same-dob pair with its reason and confidence', async () => {
    const left = chart({ id: 'p-a', patientCode: 'NKP-2026-000001' });
    const right = chart({ id: 'p-b', patientCode: 'NKP-2026-000002' });
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [left, right],
    });

    const page = await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].reasons).toEqual(['NAME_AND_DOB']);
    expect(page.items[0].confidence).toBe('MEDIUM');
    expect(page.items[0].pairKey).toBe(duplicatePairKey('p-a', 'p-b'));
    expect(page.items[0].patients.map((p) => p.patientCode)).toEqual([
      'NKP-2026-000001',
      'NKP-2026-000002',
    ]);
  });

  it('carries the clinic and organization context for each chart', async () => {
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    });

    const page = await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(page.items[0].patients[0].clinic).toEqual({
      id: CLINIC_A,
      name: 'Nkwapa Clinic - Demo',
      organizationId: 'org-1',
      organizationName: 'Nkwapa Health',
    });
  });

  it('flags a cross-clinic pair as ineligible for merge', async () => {
    const right = chart({
      id: 'p-b',
      primaryClinicId: CLINIC_B,
      primaryClinic: {
        id: CLINIC_B,
        name: 'Nkwapa Clinic - Kumasi',
        organizationId: 'org-1',
        organization: { name: 'Nkwapa Health' },
      },
    });
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' }), right],
    });

    const page = await service.listCandidates(systemAdmin, { clinicId: null });

    expect(page.items[0].crossClinic).toBe(true);
    expect(page.items[0].mergeEligible).toBe(false);
    expect(page.summary.crossClinic).toBe(1);
  });

  it('keeps a same-clinic pair merge-eligible', async () => {
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    });

    const page = await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(page.items[0].crossClinic).toBe(false);
    expect(page.items[0].mergeEligible).toBe(true);
  });

  it('drops a blocked pair the heuristics do not actually endorse', async () => {
    // The surname-and-dob blocking branch catches siblings. Scoring is what decides.
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [
        chart({ id: 'p-a', firstName: 'Ama', lastName: 'Mensah', dob: new Date('1990-05-15') }),
        chart({ id: 'p-b', firstName: 'Akosua', lastName: 'Mensah', dob: new Date('1994-01-02') }),
      ],
    });

    const page = await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(page.items).toHaveLength(0);
  });

  it('drops a pair whose other half row level security withheld', async () => {
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' })],
    });

    const page = await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(page.items).toHaveLength(0);
  });

  it('reports the more recent of the two charts as the last update', async () => {
    const { service } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [
        chart({ id: 'p-a', updatedAt: new Date('2026-02-01T00:00:00.000Z') }),
        chart({ id: 'p-b', updatedAt: new Date('2026-03-09T00:00:00.000Z') }),
      ],
    });

    const page = await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(page.items[0].lastUpdatedAt).toBe('2026-03-09T00:00:00.000Z');
  });

  it('hides dismissed pairs by default and shows them when asked', async () => {
    const pairKey = duplicatePairKey('p-a', 'p-b');
    const context = {
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
      reviews: [
        {
          pairKey,
          status: PatientDuplicateReviewStatus.DISMISSED,
          note: 'Twins, confirmed with the family.',
          reviewedAt: new Date('2026-03-01T00:00:00.000Z'),
          reviewedBy: { id: 'user-manager', displayName: 'A Manager' },
        },
      ],
    };

    const defaultPage = await createService(context).service.listCandidates(clinicManager, {
      clinicId: CLINIC_A,
    });
    expect(defaultPage.items).toHaveLength(0);
    expect(defaultPage.summary.dismissed).toBe(1);
    expect(defaultPage.summary.open).toBe(0);

    const dismissedPage = await createService(context).service.listCandidates(
      clinicManager,
      { clinicId: CLINIC_A },
      { status: PatientDuplicateReviewStatus.DISMISSED },
    );
    expect(dismissedPage.items).toHaveLength(1);
    expect(dismissedPage.items[0].review).toEqual({
      status: 'DISMISSED',
      note: 'Twins, confirmed with the family.',
      reviewedAt: '2026-03-01T00:00:00.000Z',
      reviewedBy: { id: 'user-manager', displayName: 'A Manager' },
    });
  });

  it('filters by confidence, reason, and free text', async () => {
    const context = {
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    };

    const wrongConfidence = await createService(context).service.listCandidates(
      clinicManager,
      { clinicId: CLINIC_A },
      { confidence: 'HIGH' },
    );
    expect(wrongConfidence.items).toHaveLength(0);

    const wrongReason = await createService(context).service.listCandidates(
      clinicManager,
      { clinicId: CLINIC_A },
      { reason: 'PHONE' },
    );
    expect(wrongReason.items).toHaveLength(0);

    const matchingSearch = await createService(context).service.listCandidates(
      clinicManager,
      { clinicId: CLINIC_A },
      { q: 'mensah' },
    );
    expect(matchingSearch.items).toHaveLength(1);

    const missingSearch = await createService(context).service.listCandidates(
      clinicManager,
      { clinicId: CLINIC_A },
      { q: 'boateng' },
    );
    expect(missingSearch.items).toHaveLength(0);
  });

  it('orders the strongest candidate first and paginates without losing the total', async () => {
    const patients = [
      chart({ id: 'p-a' }),
      chart({ id: 'p-b' }),
      chart({ id: 'p-c', firstName: 'Kofi', lastName: 'Boateng', phoneE164: '+233201234567' }),
      chart({ id: 'p-d', firstName: 'Yaa', lastName: 'Asante', phoneE164: '+233201234567' }),
    ];
    const { service } = createService({
      pairs: [
        { patientAId: 'p-c', patientBId: 'p-d' },
        { patientAId: 'p-a', patientBId: 'p-b' },
      ],
      patients,
    });

    const page = await service.listCandidates(
      clinicManager,
      { clinicId: CLINIC_A },
      { pageSize: 1 },
    );

    expect(page.total).toBe(2);
    expect(page.pageSize).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].reasons).toEqual(['NAME_AND_DOB']);

    const second = await createService({
      pairs: [
        { patientAId: 'p-c', patientBId: 'p-d' },
        { patientAId: 'p-a', patientBId: 'p-b' },
      ],
      patients,
    }).service.listCandidates(clinicManager, { clinicId: CLINIC_A }, { pageSize: 1, page: 2 });

    expect(second.items[0].reasons).toEqual(['PHONE']);
  });

  it('writes nothing at all while listing', async () => {
    // The acceptance criterion the whole surface hangs on: opening the queue must be free of
    // consequence, so neither a review row nor an audit event may appear from a read.
    const { service, upsert, logWrite } = createService({
      pairs: [{ patientAId: 'p-a', patientBId: 'p-b' }],
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    });

    await service.listCandidates(clinicManager, { clinicId: CLINIC_A });

    expect(upsert).not.toHaveBeenCalled();
    expect(logWrite).not.toHaveBeenCalled();
  });
});

describe('PatientDuplicateService.recordReview', () => {
  const reviewInput = {
    patientAId: 'p-a',
    patientBId: 'p-b',
    status: PatientDuplicateReviewStatus.DISMISSED,
    note: '  Twins  ',
  };

  function reviewRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'review-1',
      pairKey: duplicatePairKey('p-a', 'p-b'),
      status: PatientDuplicateReviewStatus.DISMISSED,
      note: 'Twins',
      reviewedAt: new Date('2026-03-01T00:00:00.000Z'),
      reviewedBy: { id: 'user-manager', displayName: 'A Manager' },
      ...overrides,
    };
  }

  it('stores the decision against the sorted pair key and audits it', async () => {
    const { service, upsert, logWrite } = createService({
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    });
    upsert.mockResolvedValue(reviewRow());

    const result = await service.recordReview(
      clinicManager,
      { clinicId: CLINIC_A },
      reviewInput,
      'req-1',
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pairKey: duplicatePairKey('p-a', 'p-b') } }),
    );
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      clinicId: CLINIC_A,
      status: PatientDuplicateReviewStatus.DISMISSED,
      note: 'Twins',
      reviewedByUserId: 'user-manager',
    });
    expect(logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_A,
        actorUserId: 'user-manager',
        action: 'PATIENT.DUPLICATE.REVIEW',
        entityType: 'PatientDuplicateReview',
        requestId: 'req-1',
      }),
    );
    expect(result.status).toBe(PatientDuplicateReviewStatus.DISMISSED);
  });

  it('stores a cross-clinic decision unowned so only system admins can read it', async () => {
    const { service, upsert } = createService({
      patients: [
        chart({ id: 'p-a' }),
        chart({
          id: 'p-b',
          primaryClinicId: CLINIC_B,
          primaryClinic: {
            id: CLINIC_B,
            name: 'Nkwapa Clinic - Kumasi',
            organizationId: 'org-1',
            organization: { name: 'Nkwapa Health' },
          },
        }),
      ],
    });
    upsert.mockResolvedValue(reviewRow());

    await service.recordReview(systemAdmin, { clinicId: null }, reviewInput);

    expect(upsert.mock.calls[0][0].create.clinicId).toBeNull();
  });

  it('refuses when either chart is not visible to the caller', async () => {
    const { service, upsert } = createService({ patients: [chart({ id: 'p-a' })] });

    await expect(
      service.recordReview(clinicManager, { clinicId: CLINIC_A }, reviewInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a chart that belongs to another clinic on a clinic-scoped review', async () => {
    const { service, upsert } = createService({
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b', primaryClinicId: CLINIC_B })],
    });

    await expect(
      service.recordReview(clinicManager, { clinicId: CLINIC_A }, reviewInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses to review a chart against itself', async () => {
    const { service, upsert } = createService({
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-a' })],
    });

    await expect(
      service.recordReview(
        clinicManager,
        { clinicId: CLINIC_A },
        { ...reviewInput, patientBId: 'p-a' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses an unscoped review from a clinic manager', async () => {
    const { service, upsert } = createService({
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    });

    await expect(
      service.recordReview(clinicManager, { clinicId: null }, reviewInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('stores a blank note as null rather than whitespace', async () => {
    const { service, upsert } = createService({
      patients: [chart({ id: 'p-a' }), chart({ id: 'p-b' })],
    });
    upsert.mockResolvedValue(reviewRow({ note: null }));

    await service.recordReview(
      clinicManager,
      { clinicId: CLINIC_A },
      { ...reviewInput, note: '   ' },
    );

    expect(upsert.mock.calls[0][0].create.note).toBeNull();
  });
});

/*
  Every duplicate rule, driven through the queue rather than through the scorer.

  `packages/db` already proves the heuristics compute what they should. What was untested is the
  seam: blocking hands the service a pair of ids, the service hydrates them and scores them, and
  only then does it decide whether an operator ever sees the pair. A rule can be perfectly
  implemented and still never reach the screen -- the service drops any pair the rules do not
  endorse, so a scoring change that quietly returns no reasons empties the queue silently.

  The fuzzy rule matters most here. It is the only one that tolerates a difference, and it is
  the one a conservative change to the scorer would drop first.
*/
describe('PatientDuplicateService - candidate rules reach the queue', () => {
  /** Lay one matrix case out as two charts in the same clinic, so nothing else blocks it. */
  function chartsFor(rule: (typeof DUPLICATE_RULE_CASES)[number]) {
    const asChart = (side: typeof rule.left) =>
      chart({
        id: side.id,
        firstName: side.firstName,
        lastName: side.lastName,
        dob: side.dob === null ? null : new Date(side.dob as string),
        phoneE164: side.phoneE164,
        email: side.email,
        nationalIdHash: side.nationalIdHash,
        nationalIdType: side.nationalIdType,
        nationalIdLast4: side.nationalIdLast4,
      } as Partial<DuplicatePatientRecord>);
    return [asChart(rule.left), asChart(rule.right)];
  }

  async function queueFor(rule: (typeof DUPLICATE_RULE_CASES)[number]) {
    const patients = chartsFor(rule);
    const { service } = createService({
      pairs: [{ patientAId: rule.left.id, patientBId: rule.right.id }],
      patients,
    });
    return service.listCandidates(systemAdmin, { clinicId: CLINIC_A });
  }

  it.each(DUPLICATE_RULE_CASES.map((rule) => [rule.reason, rule] as const))(
    'surfaces a %s pair with the reason and confidence the table publishes',
    async (_reason, rule) => {
      const page = await queueFor(rule);

      expect(page.items).toHaveLength(1);
      expect(page.items[0].reasons).toEqual(rule.expectedReasons);
      expect(page.items[0].score).toBe(rule.expectedScore);
      expect(page.items[0].confidence).toBe(rule.expectedConfidence);
      // Same clinic on both sides, so nothing stops an operator merging them.
      expect(page.items[0].crossClinic).toBe(false);
      expect(page.items[0].mergeEligible).toBe(true);
    },
  );

  it('surfaces the one fuzzy rule as readily as the exact ones', async () => {
    const fuzzy = DUPLICATE_RULE_CASES.find((rule) => rule.kind === 'fuzzy');
    expect(fuzzy).toBeDefined();

    const page = await queueFor(fuzzy!);

    expect(page.items[0].reasons).toContain('NAME_SIMILAR_AND_DOB');
    expect(page.total).toBe(1);
  });

  it('sums two weak signals into one MEDIUM candidate rather than two rows', async () => {
    const page = await queueFor(DUPLICATE_COMBINED_CASE);

    expect(page.items).toHaveLength(1);
    expect(page.items[0].reasons).toEqual(DUPLICATE_COMBINED_CASE.expectedReasons);
    expect(page.items[0].confidence).toBe('MEDIUM');
    for (const reason of DUPLICATE_COMBINED_CASE.expectedReasons) {
      expect(DUPLICATE_MATCH_WEIGHTS[reason]).toBeLessThan(page.items[0].score);
    }
  });
});

describe('PatientDuplicateService - queue summary and paging', () => {
  /** n distinct same-name-and-dob pairs, each scoring MEDIUM on its own. */
  function pairsOfSize(count: number) {
    const pairs: { patientAId: string; patientBId: string }[] = [];
    const patients: ReturnType<typeof chart>[] = [];
    for (let i = 0; i < count; i += 1) {
      const a = `00000000-0000-4000-8000-${String(i * 2 + 100).padStart(12, '0')}`;
      const b = `00000000-0000-4000-8000-${String(i * 2 + 101).padStart(12, '0')}`;
      pairs.push({ patientAId: a, patientBId: b });
      patients.push(
        chart({ id: a, firstName: `First${i}`, lastName: `Last${i}` }),
        chart({ id: b, firstName: `First${i}`, lastName: `Last${i}` }),
      );
    }
    return { pairs, patients };
  }

  it('reports the queue summary alongside the page', async () => {
    const highPair = DUPLICATE_RULE_CASES.find((r) => r.expectedConfidence === 'HIGH')!;
    const { service } = createService({
      pairs: [
        { patientAId: highPair.left.id, patientBId: highPair.right.id },
        { patientAId: 'cross-a', patientBId: 'cross-b' },
      ],
      patients: [
        chart({ id: highPair.left.id, nationalIdHash: 'shared-hash' }),
        chart({ id: highPair.right.id, nationalIdHash: 'shared-hash' }),
        chart({ id: 'cross-a', nationalIdHash: 'other-hash' }),
        chart({ id: 'cross-b', nationalIdHash: 'other-hash', primaryClinicId: CLINIC_B }),
      ],
    });

    const page = await service.listCandidates(systemAdmin, { clinicId: null });

    expect(page.summary.open).toBe(2);
    expect(page.summary.high).toBe(2);
    expect(page.summary.crossClinic).toBe(1);
    expect(page.summary.dismissed).toBe(0);
  });

  /*
    Blocking stops at a fixed ceiling, because the alternative on a large clinic is a scan that
    does not finish. An operator who is shown 500 pairs and not told there were more will believe
    they have cleared the queue when they have not.
  */
  it('says so when blocking hit its ceiling', async () => {
    const { pairs, patients } = pairsOfSize(DUPLICATE_PAIR_SCAN_LIMIT);
    const { service } = createService({ pairs, patients });

    const page = await service.listCandidates(systemAdmin, { clinicId: CLINIC_A });

    expect(page.truncated).toBe(true);
  });

  it('does not claim truncation when blocking came back under the ceiling', async () => {
    const { pairs, patients } = pairsOfSize(3);
    const { service } = createService({ pairs, patients });

    const page = await service.listCandidates(systemAdmin, { clinicId: CLINIC_A });

    expect(page.truncated).toBe(false);
    expect(page.total).toBe(3);
  });

  it.each([
    ['a page size below one', { pageSize: 0 }, 1],
    ['a negative page size', { pageSize: -10 }, 1],
    ['a page size past the ceiling', { pageSize: 5000 }, 100],
  ])('clamps %s', async (_label, filters, expected) => {
    const { pairs, patients } = pairsOfSize(2);
    const { service } = createService({ pairs, patients });

    const page = await service.listCandidates(systemAdmin, { clinicId: CLINIC_A }, filters);

    expect(page.pageSize).toBe(expected);
  });

  it('clamps a page number below one rather than reading backwards off the array', async () => {
    const { pairs, patients } = pairsOfSize(2);
    const { service } = createService({ pairs, patients });

    const page = await service.listCandidates(systemAdmin, { clinicId: CLINIC_A }, { page: 0 });

    expect(page.page).toBe(1);
    expect(page.items).toHaveLength(2);
  });

  it('keeps the unfiltered total while returning one page of it', async () => {
    const { pairs, patients } = pairsOfSize(4);
    const { service } = createService({ pairs, patients });

    const page = await service.listCandidates(
      systemAdmin,
      { clinicId: CLINIC_A },
      { page: 2, pageSize: 3 },
    );

    expect(page.total).toBe(4);
    expect(page.items).toHaveLength(1);
  });
});

describe('PatientDuplicateService.recordReview - revisiting a decision', () => {
  const pairKey = duplicatePairKey(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  );

  /*
    A decision can be revisited: the queue offers an undo, and an operator who dismissed a pair in
    error has to be able to say so. The audit event is what makes that reversible-but-accountable,
    and it needs the previous state -- which is only present on the update path.
  */
  it('carries the previous decision into the audit event when one is overwritten', async () => {
    const { service, logWrite, upsert, reviewFindUnique } = createService({
      patients: [
        chart({ id: '00000000-0000-4000-8000-000000000001' }),
        chart({ id: '00000000-0000-4000-8000-000000000002' }),
      ],
    });
    reviewFindUnique.mockResolvedValue({
      status: PatientDuplicateReviewStatus.DISMISSED,
      note: 'Twin sisters, checked with the family',
    });
    upsert.mockResolvedValue({
      id: 'review-1',
      pairKey,
      status: PatientDuplicateReviewStatus.CONFIRMED,
      note: 'Reversed: same person after all',
      reviewedAt: new Date('2026-09-02T12:00:00.000Z'),
      reviewedBy: { id: 'user-admin', displayName: 'Admin' },
    });

    await service.recordReview(
      systemAdmin,
      { clinicId: CLINIC_A },
      {
        patientAId: '00000000-0000-4000-8000-000000000001',
        patientBId: '00000000-0000-4000-8000-000000000002',
        status: PatientDuplicateReviewStatus.CONFIRMED,
        note: 'Reversed: same person after all',
      },
      'req-1',
    );

    const event = logWrite.mock.calls[0][0];
    expect(JSON.parse(event.beforeJson)).toEqual({
      status: 'DISMISSED',
      note: 'Twin sisters, checked with the family',
    });
    expect(JSON.parse(event.afterJson)).toMatchObject({ status: 'CONFIRMED' });
  });

  it('records no previous state the first time a pair is decided', async () => {
    const { service, logWrite, upsert } = createService({
      patients: [
        chart({ id: '00000000-0000-4000-8000-000000000001' }),
        chart({ id: '00000000-0000-4000-8000-000000000002' }),
      ],
    });
    upsert.mockResolvedValue({
      id: 'review-1',
      pairKey,
      status: PatientDuplicateReviewStatus.DISMISSED,
      note: null,
      reviewedAt: new Date('2026-09-02T12:00:00.000Z'),
      reviewedBy: null,
    });

    await service.recordReview(
      systemAdmin,
      { clinicId: CLINIC_A },
      {
        patientAId: '00000000-0000-4000-8000-000000000001',
        patientBId: '00000000-0000-4000-8000-000000000002',
        status: PatientDuplicateReviewStatus.DISMISSED,
      },
      'req-1',
    );

    expect(logWrite.mock.calls[0][0].beforeJson).toBeNull();
  });
});
