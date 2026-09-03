import { ForbiddenException } from '@nestjs/common';
import { PatientDuplicateReviewStatus, UserRole } from '@prisma/client';
import { duplicatePairKey } from '@nkwapa/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PatientDuplicateRepository,
  type DuplicatePatientRecord,
} from './patient-duplicate.repository';
import { PatientDuplicateService, type DuplicateReviewActor } from './patient-duplicate.service';

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
  const prisma = {
    patientDuplicateReview: {
      findUnique: jest.fn().mockResolvedValue(null),
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
