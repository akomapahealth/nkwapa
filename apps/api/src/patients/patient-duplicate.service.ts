import { ForbiddenException, Injectable } from '@nestjs/common';
import { PatientDuplicateReviewStatus, UserRole } from '@prisma/client';
import {
  duplicatePairKey,
  evaluateDuplicatePair,
  type DuplicateConfidence,
  type DuplicateMatchReason,
} from '@nkwapa/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DUPLICATE_PAIR_SCAN_LIMIT,
  PatientDuplicateRepository,
  type DuplicatePatientRecord,
} from './patient-duplicate.repository';

/** The caller, in the shape the admin module already passes around. */
export interface DuplicateReviewActor {
  userId: string;
  roles: { clinicId: string | null; role: UserRole }[];
}

/**
 * Which patients to consider.
 *
 * `clinicId` restricts the scan to one clinic. `null` means "every clinic the caller can already
 * see", which for anyone but a system admin is the same set row-level security would have given
 * them anyway -- so this is a narrowing option, never a widening one.
 */
export interface DuplicateScope {
  clinicId: string | null;
}

export interface ListDuplicateCandidatesFilters {
  status?: PatientDuplicateReviewStatus | 'ALL';
  confidence?: DuplicateConfidence | 'ALL';
  reason?: DuplicateMatchReason;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface DuplicateCandidatePatient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  sex: string;
  phoneE164: string | null;
  email: string | null;
  nationalIdType: string | null;
  nationalIdLast4: string | null;
  portalLinked: boolean;
  createdAt: string;
  updatedAt: string;
  clinic: {
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  };
}

export interface DuplicateCandidateReview {
  status: PatientDuplicateReviewStatus;
  note: string | null;
  reviewedAt: string;
  reviewedBy: { id: string; displayName: string } | null;
}

export interface DuplicateCandidate {
  pairKey: string;
  score: number;
  confidence: DuplicateConfidence;
  reasons: DuplicateMatchReason[];
  /** True when the two charts sit in different clinics. */
  crossClinic: boolean;
  /**
   * Whether the existing merge endpoint would accept this pair today.
   *
   * `AdminService.mergePatients` refuses two charts in different clinics, so a cross-clinic pair
   * is investigable but not actionable. Saying so here keeps the UI from offering a button that
   * can only fail.
   */
  mergeEligible: boolean;
  /** The more recent of the two charts' `updatedAt`. */
  lastUpdatedAt: string;
  review: DuplicateCandidateReview | null;
  patients: [DuplicateCandidatePatient, DuplicateCandidatePatient];
}

export interface DuplicateCandidatePage {
  items: DuplicateCandidate[];
  total: number;
  page: number;
  pageSize: number;
  generatedAt: string;
  /** True when blocking hit its ceiling and some pairs were not considered. */
  truncated: boolean;
  summary: {
    open: number;
    high: number;
    crossClinic: number;
    dismissed: number;
  };
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class PatientDuplicateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PatientDuplicateRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * The queue itself. Read-only from end to end: it generates candidates, scores them, attaches
   * whatever decision has already been recorded, and returns them. It writes nothing, and it
   * touches no column on `Patient`.
   */
  async listCandidates(
    actor: DuplicateReviewActor,
    scope: DuplicateScope,
    filters: ListDuplicateCandidatesFilters = {},
  ): Promise<DuplicateCandidatePage> {
    this.assertScopeAllowed(actor, scope);

    const pairs = await this.repository.findCandidatePairs({ clinicId: scope.clinicId });
    const truncated = pairs.length >= DUPLICATE_PAIR_SCAN_LIMIT;

    const patientIds = [...new Set(pairs.flatMap((pair) => [pair.patientAId, pair.patientBId]))];
    const patients = await this.repository.findPatientsByIds(patientIds);
    const byId = new Map(patients.map((patient) => [patient.id, patient]));

    const scored = pairs.flatMap((pair) => {
      const left = byId.get(pair.patientAId);
      const right = byId.get(pair.patientBId);
      // A pair whose members row-level security withheld is not an error; it is simply not this
      // caller's to see. Dropping it is the only correct response.
      if (!left || !right) return [];

      const evaluation = evaluateDuplicatePair(left, right);
      // Blocking is broader than scoring on purpose -- the surname-and-dob branch, for one,
      // catches siblings. Anything the rules do not actually endorse is dropped here.
      if (evaluation.reasons.length === 0) return [];

      return [{ left, right, evaluation }];
    });

    const reviews = await this.repository.findReviewsByPairKeys(
      scored.map(({ left, right }) => duplicatePairKey(left.id, right.id)),
    );
    const reviewByPairKey = new Map(reviews.map((review) => [review.pairKey, review]));

    const candidates: DuplicateCandidate[] = scored.map(({ left, right, evaluation }) => {
      const pairKey = duplicatePairKey(left.id, right.id);
      const review = reviewByPairKey.get(pairKey);
      const crossClinic = left.primaryClinicId !== right.primaryClinicId;

      return {
        pairKey,
        score: evaluation.score,
        confidence: evaluation.confidence,
        reasons: evaluation.reasons,
        crossClinic,
        mergeEligible: !crossClinic,
        lastUpdatedAt: (left.updatedAt > right.updatedAt
          ? left.updatedAt
          : right.updatedAt
        ).toISOString(),
        review: review
          ? {
              status: review.status,
              note: review.note,
              reviewedAt: review.reviewedAt.toISOString(),
              reviewedBy: review.reviewedBy
                ? { id: review.reviewedBy.id, displayName: review.reviewedBy.displayName }
                : null,
            }
          : null,
        patients: [this.toCandidatePatient(left), this.toCandidatePatient(right)],
      };
    });

    const summary = {
      open: candidates.filter((candidate) => this.statusOf(candidate) === 'OPEN').length,
      high: candidates.filter(
        (candidate) => candidate.confidence === 'HIGH' && this.statusOf(candidate) === 'OPEN',
      ).length,
      crossClinic: candidates.filter((candidate) => candidate.crossClinic).length,
      dismissed: candidates.filter((candidate) => this.statusOf(candidate) === 'DISMISSED').length,
    };

    const filtered = candidates
      .filter((candidate) => this.matchesFilters(candidate, filters))
      // Strongest first, then most recently touched: an operator working top-down should meet the
      // pair they are most likely to act on, and among equals the one someone just edited.
      .sort((a, b) => b.score - a.score || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));

    const pageSize = Math.min(Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      generatedAt: new Date().toISOString(),
      truncated,
      summary,
    };
  }

  /**
   * Record what an operator decided about one pair.
   *
   * This is the only write in the module, and it writes to `PatientDuplicateReview` alone. It
   * does not merge, does not tombstone, and does not alter either chart. A pair that is genuinely
   * a duplicate still has to go through `POST /admin/patients/merge`, which stays system-admin
   * only.
   */
  async recordReview(
    actor: DuplicateReviewActor,
    scope: DuplicateScope,
    input: {
      patientAId: string;
      patientBId: string;
      status: PatientDuplicateReviewStatus;
      note?: string | null;
    },
    requestId?: string,
  ): Promise<DuplicateCandidateReview & { pairKey: string }> {
    this.assertScopeAllowed(actor, scope);

    const patients = await this.repository.findPatientsByIds([input.patientAId, input.patientBId]);
    // Row-level security already withheld anything out of scope, so a short read is a refusal,
    // not a missing record. Reporting it as "not found" would leak that the id resolves.
    if (patients.length !== 2 || input.patientAId === input.patientBId) {
      throw new ForbiddenException('Both patient records must be visible to review this pair');
    }
    if (scope.clinicId && patients.some((p) => p.primaryClinicId !== scope.clinicId)) {
      throw new ForbiddenException('Both patient records must belong to this clinic');
    }

    const pairKey = duplicatePairKey(input.patientAId, input.patientBId);
    const [patientAId, patientBId] = pairKey.split(':');
    const crossClinic = patients[0].primaryClinicId !== patients[1].primaryClinicId;
    // A cross-clinic pair belongs to neither clinic, so the decision is stored unowned and the
    // row-level-security policy limits it to system admins -- the same people who can see both
    // charts in the first place.
    const clinicId = crossClinic ? null : patients[0].primaryClinicId;
    const note = input.note?.trim() ? input.note.trim() : null;

    const existing = await this.prisma.patientDuplicateReview.findUnique({ where: { pairKey } });

    const review = await this.prisma.patientDuplicateReview.upsert({
      where: { pairKey },
      create: {
        pairKey,
        clinicId,
        patientAId,
        patientBId,
        status: input.status,
        note,
        reviewedByUserId: actor.userId,
      },
      update: {
        status: input.status,
        note,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
      },
      include: { reviewedBy: { select: { id: true, displayName: true } } },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'PATIENT.DUPLICATE.REVIEW',
      entityType: 'PatientDuplicateReview',
      entityId: review.id,
      beforeJson: existing
        ? JSON.stringify({ status: existing.status, note: existing.note })
        : null,
      afterJson: JSON.stringify({
        pairKey,
        status: review.status,
        note: review.note,
        crossClinic,
      }),
      requestId,
    });

    return {
      pairKey,
      status: review.status,
      note: review.note,
      reviewedAt: review.reviewedAt.toISOString(),
      reviewedBy: review.reviewedBy
        ? { id: review.reviewedBy.id, displayName: review.reviewedBy.displayName }
        : null,
    };
  }

  /**
   * The all-clinics view is system-admin only.
   *
   * Row-level security would already hold the line -- a clinic user's context lists only their
   * own clinics -- but a permission that depends on the database to be correct is one refactor
   * away from not being a permission. The clinic-scoped routes are guarded by `ClinicScopeGuard`
   * before they reach this service.
   */
  private assertScopeAllowed(actor: DuplicateReviewActor, scope: DuplicateScope) {
    if (scope.clinicId) return;
    const isSystemAdmin = actor.roles.some(
      (role) => role.role === UserRole.SYSTEM_ADMIN && role.clinicId === null,
    );
    if (!isSystemAdmin) {
      throw new ForbiddenException(
        'Only System Admin can review suspected duplicates across clinics',
      );
    }
  }

  private statusOf(candidate: DuplicateCandidate): PatientDuplicateReviewStatus {
    return candidate.review?.status ?? PatientDuplicateReviewStatus.OPEN;
  }

  private matchesFilters(
    candidate: DuplicateCandidate,
    filters: ListDuplicateCandidatesFilters,
  ): boolean {
    // Dismissed pairs are hidden unless asked for. That is the whole point of recording a
    // dismissal: the queue gets shorter as it is worked, rather than resetting on every visit.
    const status = filters.status ?? PatientDuplicateReviewStatus.OPEN;
    if (status !== 'ALL' && this.statusOf(candidate) !== status) return false;

    if (filters.confidence && filters.confidence !== 'ALL') {
      if (candidate.confidence !== filters.confidence) return false;
    }

    if (filters.reason && !candidate.reasons.includes(filters.reason)) return false;

    const query = filters.q?.trim().toLowerCase();
    if (query) {
      const haystack = candidate.patients
        .map((patient) =>
          [patient.firstName, patient.lastName, patient.patientCode, patient.clinic.name].join(' '),
        )
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  }

  private toCandidatePatient(patient: DuplicatePatientRecord): DuplicateCandidatePatient {
    return {
      id: patient.id,
      patientCode: patient.patientCode,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dob: patient.dob ? patient.dob.toISOString() : null,
      sex: patient.sex,
      phoneE164: patient.phoneE164,
      email: patient.email,
      nationalIdType: patient.nationalIdType,
      nationalIdLast4: patient.nationalIdLast4,
      portalLinked: patient.portalUserId !== null,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
      clinic: {
        id: patient.primaryClinic.id,
        name: patient.primaryClinic.name,
        organizationId: patient.primaryClinic.organizationId,
        organizationName: patient.primaryClinic.organization.name,
      },
    };
  }
}
