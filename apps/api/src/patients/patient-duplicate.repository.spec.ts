import { PrismaService } from '../prisma/prisma.service';
import {
  DUPLICATE_PAIR_SCAN_LIMIT,
  PatientDuplicateRepository,
} from './patient-duplicate.repository';

/*
  The blocking query, which decides which pairs exist at all.

  Everything downstream is scoring: if a pair never comes out of this query, no heuristic can
  surface it and no operator will ever see it. It is the one piece of raw SQL in the identity
  workflow and it had no test, so a dropped join branch or a lost `mergedIntoPatientId` filter
  would have shown up as a queue that quietly got shorter.

  Asserting on SQL text is unusual and worth justifying: the alternative is a real database, and
  what is actually at risk here is not the planner's behaviour but the loss of a clause. These
  assertions are about presence and shape, not formatting.
*/
describe('PatientDuplicateRepository.findCandidatePairs', () => {
  let queryRaw: jest.Mock;
  let repository: PatientDuplicateRepository;

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([]);
    repository = new PatientDuplicateRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  /** The template's literal fragments, joined by the holes its bound values fill. */
  function sql(): string {
    return (queryRaw.mock.calls[0][0] as string[]).join(' ? ');
  }

  function boundValues(): unknown[] {
    return queryRaw.mock.calls[0].slice(1);
  }

  it('never considers a chart a merge already retired', async () => {
    await repository.findCandidatePairs({});

    // A tombstone is the resolved outcome of a previous duplicate, not a new one to review.
    expect(sql()).toContain('"mergedIntoPatientId" IS NULL');
  });

  it.each([
    ['the same national ID', '"nationalIdHash" = a."nationalIdHash"'],
    ['the same phone number', '"phoneE164" = a."phoneE164"'],
    ['the same email address, case-insensitively', 'lower(b."email") = lower(a."email")'],
    ['the same partial ID and date of birth', '"nationalIdLast4" = a."nationalIdLast4"'],
    ['the same surname and date of birth', 'upper(b."lastName") = upper(a."lastName")'],
  ])('blocks on %s', async (_label, fragment) => {
    await repository.findCandidatePairs({});

    expect(sql()).toContain(fragment);
  });

  /*
    A union of one join per rule, not one join with an OR of every predicate. Postgres plans each
    branch here as its own hash join; the OR form collapses to a nested loop over the cross
    product, which on a real clinic is the difference between a scan that finishes and one that
    does not.
  */
  it('keeps each rule as its own branch of a union', async () => {
    await repository.findCandidatePairs({});

    expect(sql().match(/UNION/g) ?? []).toHaveLength(4);
  });

  it('emits each pair once, whichever branch found it', async () => {
    await repository.findCandidatePairs({});

    expect(sql()).toContain('a."id" < b."id"');
  });

  it('binds the clinic filter as a parameter rather than interpolating it', async () => {
    await repository.findCandidatePairs({ clinicId: 'clinic-1' });

    expect(boundValues()).toContain('clinic-1');
    expect(sql()).not.toContain('clinic-1');
  });

  // The filter can only narrow: a null clinic scans everything row-level security allows, which
  // is the system-admin case, and never more than that.
  it('scans every visible chart when no clinic is named', async () => {
    await repository.findCandidatePairs({});

    expect(boundValues()).toContain(null);
    expect(sql()).toContain('IS NULL OR "primaryClinicId"');
  });

  it('stops at the scan ceiling by default', async () => {
    await repository.findCandidatePairs({});

    expect(boundValues()).toContain(DUPLICATE_PAIR_SCAN_LIMIT);
  });

  it('lets a caller ask for fewer', async () => {
    await repository.findCandidatePairs({ limit: 10 });

    expect(boundValues()).toContain(10);
  });
});

describe('PatientDuplicateRepository - hydration', () => {
  it('asks for nothing when there is nothing to ask about', async () => {
    const findMany = jest.fn();
    const reviewFindMany = jest.fn();
    const repository = new PatientDuplicateRepository({
      patient: { findMany },
      patientDuplicateReview: { findMany: reviewFindMany },
    } as unknown as PrismaService);

    await expect(repository.findPatientsByIds([])).resolves.toEqual([]);
    await expect(repository.findReviewsByPairKeys([])).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(reviewFindMany).not.toHaveBeenCalled();
  });

  it('never selects the national ID itself, only what is safe to compare', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PatientDuplicateRepository({
      patient: { findMany },
    } as unknown as PrismaService);

    await repository.findPatientsByIds(['patient-1']);

    const select = findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.nationalIdLast4).toBe(true);
    expect(select).not.toHaveProperty('nationalIdEncrypted');
  });
});
