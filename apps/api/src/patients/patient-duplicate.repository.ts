import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The most candidate pairs one request will consider.
 *
 * Blocking is cheap but not free, and a clinic with a data-entry problem could produce far more
 * pairs than a person will ever work through. Capping the pair set and saying so is better than
 * either truncating silently or letting one screen hold a connection open indefinitely.
 */
export const DUPLICATE_PAIR_SCAN_LIMIT = 500;

export interface DuplicatePairRow {
  patientAId: string;
  patientBId: string;
}

/** The patient columns the queue reads, with the clinic and organization context around them. */
export type DuplicatePatientRecord = Prisma.PatientGetPayload<{
  select: {
    id: true;
    patientCode: true;
    firstName: true;
    lastName: true;
    dob: true;
    sex: true;
    phoneE164: true;
    email: true;
    nationalIdHash: true;
    nationalIdType: true;
    nationalIdLast4: true;
    primaryClinicId: true;
    portalUserId: true;
    mergedIntoPatientId: true;
    createdAt: true;
    updatedAt: true;
    primaryClinic: {
      select: {
        id: true;
        name: true;
        organizationId: true;
        organization: { select: { name: true } };
      };
    };
  };
}>;

const DUPLICATE_PATIENT_SELECT = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  dob: true,
  sex: true,
  phoneE164: true,
  email: true,
  nationalIdHash: true,
  nationalIdType: true,
  nationalIdLast4: true,
  primaryClinicId: true,
  portalUserId: true,
  mergedIntoPatientId: true,
  createdAt: true,
  updatedAt: true,
  primaryClinic: {
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  },
} satisfies Prisma.PatientSelect;

/**
 * Read-only candidate generation for the suspected duplicate queue.
 *
 * Nothing in this file writes. Blocking runs as raw SQL because the question is inherently a
 * self-join and Prisma has no way to express one, but `PrismaService` is a proxy that forwards
 * `$queryRaw` into the request's row-level-security transaction, so the scan sees exactly the
 * patients the caller is entitled to see and nothing more. The optional clinic filter narrows
 * that further; it can never widen it.
 */
@Injectable()
export class PatientDuplicateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Candidate pairs, as a union of one exact-key join per rule.
   *
   * Deliberately a UNION rather than a single join with an OR of every predicate. Postgres can
   * plan each branch here as its own hash join; the OR form collapses to a nested loop over the
   * cross product, which is the difference between a scan that finishes and one that does not.
   *
   * The `upper()` and `lower()` comparisons are evaluated once per row while the hash is built,
   * so none of them needs a functional index -- which also means this adds no index to `Patient`
   * that the Prisma schema cannot express, and therefore no schema drift.
   *
   * Merged charts are excluded: a tombstone is the resolved outcome of a previous duplicate, not
   * a new one. `a.id < b.id` keeps each pair to a single row regardless of which branch found it.
   */
  async findCandidatePairs(params: {
    clinicId?: string | null;
    limit?: number;
  }): Promise<DuplicatePairRow[]> {
    const clinicId = params.clinicId ?? null;
    const limit = params.limit ?? DUPLICATE_PAIR_SCAN_LIMIT;

    return this.prisma.$queryRaw<DuplicatePairRow[]>`
      WITH scope AS (
        SELECT
          "id",
          "firstName",
          "lastName",
          "dob",
          "phoneE164",
          "email",
          "nationalIdHash",
          "nationalIdType",
          "nationalIdLast4"
        FROM "Patient"
        WHERE "mergedIntoPatientId" IS NULL
          AND (${clinicId}::uuid IS NULL OR "primaryClinicId" = ${clinicId}::uuid)
      ),
      pairs AS (
        SELECT a."id" AS "patientAId", b."id" AS "patientBId"
        FROM scope a
        JOIN scope b ON b."nationalIdHash" = a."nationalIdHash" AND a."id" < b."id"
        WHERE a."nationalIdHash" IS NOT NULL

        UNION

        SELECT a."id", b."id"
        FROM scope a
        JOIN scope b ON b."phoneE164" = a."phoneE164" AND a."id" < b."id"
        WHERE a."phoneE164" IS NOT NULL

        UNION

        SELECT a."id", b."id"
        FROM scope a
        JOIN scope b ON lower(b."email") = lower(a."email") AND a."id" < b."id"
        WHERE a."email" IS NOT NULL AND a."email" <> ''

        UNION

        SELECT a."id", b."id"
        FROM scope a
        JOIN scope b
          ON b."nationalIdLast4" = a."nationalIdLast4"
         AND b."nationalIdType" = a."nationalIdType"
         AND b."dob" = a."dob"
         AND a."id" < b."id"
        WHERE a."nationalIdLast4" IS NOT NULL AND a."dob" IS NOT NULL

        UNION

        SELECT a."id", b."id"
        FROM scope a
        JOIN scope b
          ON upper(b."lastName") = upper(a."lastName")
         AND b."dob" = a."dob"
         AND a."id" < b."id"
        WHERE a."dob" IS NOT NULL
      )
      SELECT "patientAId", "patientBId"
      FROM pairs
      ORDER BY "patientAId", "patientBId"
      LIMIT ${limit}
    `;
  }

  /** Hydrate the charts named by a pair set, with their clinic and organization. */
  async findPatientsByIds(ids: string[]): Promise<DuplicatePatientRecord[]> {
    if (ids.length === 0) return [];
    return this.prisma.patient.findMany({
      where: { id: { in: ids } },
      select: DUPLICATE_PATIENT_SELECT,
    });
  }

  /** Existing review decisions for the given pair keys, keyed by `pairKey`. */
  async findReviewsByPairKeys(pairKeys: string[]) {
    if (pairKeys.length === 0) return [];
    return this.prisma.patientDuplicateReview.findMany({
      where: { pairKey: { in: pairKeys } },
      include: { reviewedBy: { select: { id: true, displayName: true } } },
    });
  }
}
