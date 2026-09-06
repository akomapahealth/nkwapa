/**
 * Shared fixtures for the patient identity suites.
 *
 * Duplicate detection, merge, canonical redirects, portal invites and claim are five views of
 * one workflow, and they were each carrying their own copy of the same chart and the same
 * invitation. `buildInvite` in particular existed twice, in `patient-portal.service.spec.ts` and
 * in `patient.service.spec.ts`, already differing in which columns it bothered to set. One
 * definition here means a change to what a service reads shows up as one failure rather than
 * several copies drifting apart.
 *
 * Every identifier and value in this file is synthetic. No real patient data belongs here or in
 * any fixture derived from it.
 */

import { MERGE_RELATIONS } from '@nkwapa/db';

import { FIXTURE_CLINIC_ID, FIXTURE_OTHER_CLINIC_ID, FIXTURE_PATIENT_ID } from './fixture-ids';

export {
  FIXTURE_ACTOR_ID,
  FIXTURE_CLINIC_ID,
  FIXTURE_OTHER_CLINIC_ID,
  FIXTURE_PATIENT_ID,
} from './fixture-ids';

/** The chart a merge retires. `patient-1` is always the one that survives. */
export const FIXTURE_SOURCE_PATIENT_ID = 'patient-2';
export const FIXTURE_INVITE_ID = 'invite-1';
export const FIXTURE_PORTAL_USER_ID = 'user-1';
export const FIXTURE_KEYCLOAK_SUB = 'kc-sub-1';
export const FIXTURE_PATIENT_CODE = 'NKP-2026-000001';
export const FIXTURE_SOURCE_PATIENT_CODE = 'NKP-2026-000099';

/**
 * The instant every identity suite freezes the clock to.
 *
 * Invite expiry is the one identity rule that depends on the current time, so a suite that lets
 * the real clock run is a suite that passes until the fixture's expiry date arrives. Both of the
 * `buildInvite` copies this module replaces had already settled on this instant.
 */
export const IDENTITY_NOW = new Date('2026-09-02T12:00:00.000Z');

/** A whole number of days either side of `IDENTITY_NOW`. Negative is the past. */
export function identityDay(offset: number): Date {
  return new Date(IDENTITY_NOW.getTime() + offset * 24 * 60 * 60 * 1000);
}

export const FIXTURE_CLINIC = {
  id: FIXTURE_CLINIC_ID,
  name: 'Clinic One',
  isActive: true,
  organizationId: 'org-1',
  organization: { name: 'Akomapa' },
};

export const FIXTURE_OTHER_CLINIC = {
  id: FIXTURE_OTHER_CLINIC_ID,
  name: 'Clinic Two',
  isActive: true,
  organizationId: 'org-1',
  organization: { name: 'Akomapa' },
};

export type IdentityChartOverrides = Partial<{
  id: string;
  patientCode: string;
  primaryClinicId: string;
  primaryClinic: typeof FIXTURE_CLINIC;
  portalUserId: string | null;
  mergedIntoPatientId: string | null;
  firstName: string;
  lastName: string;
  dob: Date | null;
  phoneE164: string | null;
  email: string | null;
  nationalIdHash: string | null;
  nationalIdType: string | null;
  nationalIdLast4: string | null;
  sex: string;
  createdAt: Date;
  updatedAt: Date;
  codeAliases: { code: string }[];
}>;

/**
 * A patient chart, in the shape the identity services select.
 *
 * Two charts built from this default share a name, a birthday and a phone number, so the
 * duplicate heuristics score them HIGH. That matters for the merge suites: at LOW the evaluation
 * raises `WEAK_DUPLICATE_SIGNAL`, and every unrelated assertion would then be reading a findings
 * list with an extra entry in it.
 */
export function identityChartFixture(overrides: IdentityChartOverrides = {}) {
  return {
    id: overrides.id ?? FIXTURE_PATIENT_ID,
    patientCode: overrides.patientCode ?? FIXTURE_PATIENT_CODE,
    primaryClinicId: overrides.primaryClinicId ?? FIXTURE_CLINIC_ID,
    primaryClinic: overrides.primaryClinic ?? FIXTURE_CLINIC,
    portalUserId: overrides.portalUserId ?? null,
    mergedIntoPatientId: overrides.mergedIntoPatientId ?? null,
    firstName: overrides.firstName ?? 'Akua',
    lastName: overrides.lastName ?? 'Boateng',
    dob: overrides.dob === undefined ? new Date('1988-07-04') : overrides.dob,
    phoneE164: overrides.phoneE164 === undefined ? '+233209876543' : overrides.phoneE164,
    email: overrides.email ?? null,
    nationalIdHash: overrides.nationalIdHash ?? 'hash-a',
    nationalIdType: overrides.nationalIdType ?? 'NATIONAL_ID',
    nationalIdLast4: overrides.nationalIdLast4 ?? '4471',
    sex: overrides.sex ?? 'FEMALE',
    createdAt: overrides.createdAt ?? new Date('2026-01-05T08:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-09-04T09:00:00.000Z'),
    codeAliases: overrides.codeAliases ?? [],
  };
}

/** The chart a merge keeps. */
export const canonicalChartFixture = () => identityChartFixture();

/** The chart a merge retires: a different code and a different national ID, same person. */
export const sourceChartFixture = () =>
  identityChartFixture({
    id: FIXTURE_SOURCE_PATIENT_ID,
    patientCode: FIXTURE_SOURCE_PATIENT_CODE,
    nationalIdHash: 'hash-b',
    nationalIdLast4: '4472',
    updatedAt: new Date('2026-09-04T09:30:00.000Z'),
  });

/**
 * A portal invitation, carrying every column any identity suite reads.
 *
 * The union of the two `buildInvite` copies this replaces: the claim and lifecycle paths want
 * `patientId` / `clinicId` / `updatedAt`, and the staff chart summary wants `createdBy` and the
 * newest `reminders` row. A field a given suite ignores costs it nothing.
 */
export function portalInviteFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_INVITE_ID,
    patientId: FIXTURE_PATIENT_ID,
    clinicId: FIXTURE_CLINIC_ID,
    status: 'PENDING',
    email: 'ama@example.com',
    phoneE164: null,
    createdByUserId: 'manager-1',
    claimedByUserId: null,
    claimedAt: null,
    cancelledAt: null,
    expiresAt: identityDay(7),
    createdAt: identityDay(-1),
    updatedAt: identityDay(-1),
    createdBy: { displayName: 'Nurse Adjoa' },
    reminders: [],
    ...overrides,
  };
}

/** The one-to-one row binding a chart to a Keycloak identity. */
export function accountLinkFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    patientId: FIXTURE_PATIENT_ID,
    keycloakSub: FIXTURE_KEYCLOAK_SUB,
    createdAt: identityDay(-1),
    ...overrides,
  };
}

/** The signed-in account attempting a claim, in the shape `claimPatientRecord` selects. */
export function claimUserFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_PORTAL_USER_ID,
    keycloakSub: FIXTURE_KEYCLOAK_SUB,
    isActive: true,
    email: 'ama@example.com',
    phoneE164: null,
    ...overrides,
  };
}

/** A bag of jest mocks indexable by model name, which is how the merge relation loop reaches it. */
export type IdentityPrismaMock = Record<string, Record<string, jest.Mock>> & {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

/**
 * The Prisma surface the identity services touch.
 *
 * `$transaction` invokes its callback with this same object, so a test asserting on `tx.patient`
 * and one asserting on `prisma.patient` see the same calls. Every model the merge moves gets its
 * `count` and `updateMany` from `MERGE_RELATIONS`, so a relation added to the shared list is
 * reachable here without this file having to name it.
 */
export function createIdentityPrismaMock(
  options: { relationCounts?: Record<string, [number, number]> } = {},
): IdentityPrismaMock {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    patient: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ id: FIXTURE_PATIENT_ID }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    patientAccountLink: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(accountLinkFixture()),
      create: jest.fn().mockResolvedValue(accountLinkFixture()),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    patientCodeAlias: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({ id: 'alias-1' }),
    },
    patientDuplicateReview: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: 'review-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    patientMergeRecord: { create: jest.fn().mockResolvedValue({ id: 'merge-1' }) },
    userClinicRole: {
      upsert: jest.fn().mockResolvedValue({ id: 'role-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    clinic: { findUnique: jest.fn().mockResolvedValue(FIXTURE_CLINIC) },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as IdentityPrismaMock;

  for (const relation of MERGE_RELATIONS) {
    const [canonicalCount, sourceCount] = options.relationCounts?.[relation.key] ?? [0, 0];
    prisma[relation.key] = {
      ...(prisma[relation.key] ?? {}),
      count: jest.fn(async (args: { where: { patientId: string; effectiveTo?: null } }) => {
        // patientPharmacyPreference is counted twice for different questions: how many rows move,
        // and how many are still open.
        if (args.where.effectiveTo === null) return 0;
        return args.where.patientId === FIXTURE_PATIENT_ID ? canonicalCount : sourceCount;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: sourceCount }),
    };
  }

  prisma.patientPortalInvite = {
    ...prisma.patientPortalInvite,
    create: jest.fn().mockResolvedValue(portalInviteFixture()),
    findFirst: jest.fn().mockResolvedValue(null),
    // The claim path re-reads by id after a claimable-invite miss, so it can tell a patient their
    // invitation lapsed rather than that it never existed.
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(portalInviteFixture({ status: 'CLAIMED' })),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: IdentityPrismaMock) => unknown) =>
    callback(prisma),
  );

  return prisma;
}
