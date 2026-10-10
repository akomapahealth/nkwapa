import { ForbiddenException, Injectable } from '@nestjs/common';
import { PatientDuplicateReviewStatus, UserRole } from '@prisma/client';
import {
  DUPLICATE_MATCH_REASONS,
  duplicatePairKey,
  evaluateDuplicatePair,
  isMergeBlocked,
  structuralMergeFindings,
  type DuplicateConfidence,
  type DuplicateMatchReason,
  type MergeFinding,
} from '@nkwapa/db';
import { isSystemAdmin } from '../auth/clinic-roles';
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

export interface CrossClinicInvestigationFilters extends ListDuplicateCandidatesFilters {
  /** A clinic pair key, as `burden.clinicPairs[].key` reports it, to narrow the list to. */
  clinicPair?: string;
}

export interface DuplicateCandidateClinic {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
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
  clinic: DuplicateCandidateClinic;
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
   * `PatientMergeService` refuses two charts in different clinics, so a cross-clinic pair
   * is investigable but not actionable. Saying so here keeps the UI from offering a button that
   * can only fail.
   */
  mergeEligible: boolean;
  /**
   * Why not, when `mergeEligible` is false: the structural refusals the merge preview would
   * report, from the same rule, so the queue and the preview cannot disagree.
   */
  mergeBlockers: MergeFinding[];
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

/** How many cross-clinic pairs one clinic pair holds, by confidence and by review status. */
export interface CrossClinicBurdenRow {
  /** The two clinic ids, sorted and joined with a colon. Also the `clinicPair` filter value. */
  key: string;
  clinics: [DuplicateCandidateClinic, DuplicateCandidateClinic];
  sameOrganization: boolean;
  total: number;
  open: number;
  confirmed: number;
  dismissed: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * The cross-clinic picture, before any filter is applied.
 *
 * Filters narrow the list a person is reading; they must not change the numbers leadership is
 * quoting. So the burden always describes the whole scan, and `truncated` says when even that is
 * a lower bound.
 */
export interface CrossClinicBurden {
  totalPairs: number;
  openPairs: number;
  highConfidencePairs: number;
  clinicsAffected: number;
  organizationsAffected: number;
  crossOrganizationPairs: number;
  clinicPairs: CrossClinicBurdenRow[];
  reasons: { reason: DuplicateMatchReason; count: number }[];
}

export interface CrossClinicInvestigation extends DuplicateCandidatePage {
  burden: CrossClinicBurden;
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
    const candidates = await this.buildCandidates(pairs);

    return this.toPage(candidates, filters, pairs.length >= DUPLICATE_PAIR_SCAN_LIMIT);
  }

  /**
   * Likely duplicates whose two charts sit in different active clinics, with the burden they add
   * up to.
   *
   * Read-only, like the queue. It exists because consolidation across clinics is not built and
   * not yet a policy: before anyone decides whether to build it, leadership needs to know how
   * much of the problem there is and where. Every view is audited, because this is the one screen
   * that puts two clinics' identity data side by side.
   */
  async investigateCrossClinic(
    actor: DuplicateReviewActor,
    filters: CrossClinicInvestigationFilters = {},
    requestId?: string,
  ): Promise<CrossClinicInvestigation> {
    this.assertScopeAllowed(actor, { clinicId: null });

    const pairs = await this.repository.findCandidatePairs({
      clinicId: null,
      crossClinicOnly: true,
    });
    // The scan already excludes same-clinic pairs; the filter here is a second statement of the
    // contract rather than the thing enforcing it, so a regression in the SQL cannot leak a
    // same-clinic pair into a screen that says every row spans two clinics.
    const candidates = (await this.buildCandidates(pairs)).filter(
      (candidate) => candidate.crossClinic,
    );
    const truncated = pairs.length >= DUPLICATE_PAIR_SCAN_LIMIT;

    const inPair = filters.clinicPair
      ? candidates.filter((candidate) => this.clinicPairKey(candidate) === filters.clinicPair)
      : candidates;

    const result: CrossClinicInvestigation = {
      ...this.toPage(inPair, filters, truncated),
      // The summary describes the whole scan, like the burden, not the clinic pair in view.
      summary: this.summarize(candidates),
      burden: this.burdenOf(candidates),
    };

    await this.auditService.logWrite({
      clinicId: null,
      actorUserId: actor.userId,
      action: 'PATIENT.DUPLICATE.CROSS_CLINIC.VIEW',
      entityType: 'PatientDuplicateInvestigation',
      entityId: 'cross-clinic',
      beforeJson: null,
      // What was asked and how much came back -- never which patients. The audit trail has to say
      // that someone looked without becoming a second copy of what they saw.
      afterJson: JSON.stringify({
        filters: {
          status: filters.status ?? PatientDuplicateReviewStatus.OPEN,
          confidence: filters.confidence ?? 'ALL',
          reason: filters.reason ?? null,
          searched: Boolean(filters.q?.trim()),
          clinicPair: filters.clinicPair ?? null,
          page: result.page,
        },
        returned: result.items.length,
        matched: result.total,
        totalPairs: result.burden.totalPairs,
        clinicPairs: result.burden.clinicPairs.length,
        truncated,
      }),
      requestId,
    });

    return result;
  }

  /** Score each blocked pair, drop the ones the rules do not endorse, and attach any decision. */
  private async buildCandidates(
    pairs: { patientAId: string; patientBId: string }[],
  ): Promise<DuplicateCandidate[]> {
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

    return scored.map(({ left, right, evaluation }) => {
      const pairKey = duplicatePairKey(left.id, right.id);
      const review = reviewByPairKey.get(pairKey);
      const mergeBlockers = structuralMergeFindings(left, right);

      return {
        pairKey,
        score: evaluation.score,
        confidence: evaluation.confidence,
        reasons: evaluation.reasons,
        crossClinic: left.primaryClinicId !== right.primaryClinicId,
        mergeEligible: !isMergeBlocked(mergeBlockers),
        mergeBlockers,
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
  }

  /** Filter, order and slice one page, keeping the unfiltered summary alongside it. */
  private toPage(
    candidates: DuplicateCandidate[],
    filters: ListDuplicateCandidatesFilters,
    truncated: boolean,
  ): DuplicateCandidatePage {
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
      summary: this.summarize(candidates),
    };
  }

  private summarize(candidates: DuplicateCandidate[]): DuplicateCandidatePage['summary'] {
    return {
      open: candidates.filter((candidate) => this.statusOf(candidate) === 'OPEN').length,
      high: candidates.filter(
        (candidate) => candidate.confidence === 'HIGH' && this.statusOf(candidate) === 'OPEN',
      ).length,
      crossClinic: candidates.filter((candidate) => candidate.crossClinic).length,
      dismissed: candidates.filter((candidate) => this.statusOf(candidate) === 'DISMISSED').length,
    };
  }

  private burdenOf(candidates: DuplicateCandidate[]): CrossClinicBurden {
    const rows = new Map<string, CrossClinicBurdenRow>();
    const reasonCounts = new Map<DuplicateMatchReason, number>();
    const clinics = new Set<string>();
    const organizations = new Set<string>();

    for (const candidate of candidates) {
      const key = this.clinicPairKey(candidate);
      const [first, second] = [...candidate.patients]
        .map((patient) => patient.clinic)
        .sort((a, b) => a.id.localeCompare(b.id));
      const row = rows.get(key) ?? {
        key,
        clinics: [first, second],
        sameOrganization: first.organizationId === second.organizationId,
        total: 0,
        open: 0,
        confirmed: 0,
        dismissed: 0,
        high: 0,
        medium: 0,
        low: 0,
      };

      row.total += 1;
      const status = this.statusOf(candidate);
      if (status === 'OPEN') row.open += 1;
      if (status === 'CONFIRMED') row.confirmed += 1;
      if (status === 'DISMISSED') row.dismissed += 1;
      if (candidate.confidence === 'HIGH') row.high += 1;
      if (candidate.confidence === 'MEDIUM') row.medium += 1;
      if (candidate.confidence === 'LOW') row.low += 1;
      rows.set(key, row);

      for (const reason of candidate.reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
      for (const clinic of [first, second]) {
        clinics.add(clinic.id);
        organizations.add(clinic.organizationId);
      }
    }

    const clinicPairs = [...rows.values()].sort(
      (a, b) => b.open - a.open || b.total - a.total || a.key.localeCompare(b.key),
    );

    return {
      totalPairs: candidates.length,
      openPairs: candidates.filter((candidate) => this.statusOf(candidate) === 'OPEN').length,
      highConfidencePairs: candidates.filter((candidate) => candidate.confidence === 'HIGH').length,
      clinicsAffected: clinics.size,
      organizationsAffected: organizations.size,
      crossOrganizationPairs: clinicPairs
        .filter((row) => !row.sameOrganization)
        .reduce((sum, row) => sum + row.total, 0),
      clinicPairs,
      // In the catalog's own order, strongest rule first, and only the rules that fired.
      reasons: DUPLICATE_MATCH_REASONS.flatMap((reason) => {
        const count = reasonCounts.get(reason) ?? 0;
        return count > 0 ? [{ reason, count }] : [];
      }),
    };
  }

  private clinicPairKey(candidate: DuplicateCandidate): string {
    return candidate.patients
      .map((patient) => patient.clinic.id)
      .sort()
      .join(':');
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
    if (!isSystemAdmin(actor.roles)) {
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
