import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, type PatientAccountLink } from '@prisma/client';
import {
  MERGE_RELATIONS,
  duplicatePairKey,
  evaluateDuplicatePair,
  isMergeBlocked,
  mergeFinding,
  mergePreviewFingerprint,
  type DuplicateConfidence,
  type DuplicateMatchReason,
  type MergeFinding,
  type MergeRelationKey,
} from '@nkwapa/db';
import { AuditService } from '../audit/audit.service';
import { isSystemAdmin, type ScopedRole } from '../auth/clinic-roles';
import { PrismaService } from '../prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

/** The caller, in the shape the admin and duplicate-review services already pass around. */
export interface MergeActor {
  userId: string;
  roles: ScopedRole[];
}

export interface MergeStrategies {
  portalLinkStrategy?: 'CANONICAL' | 'SOURCE';
  inviteStrategy?: 'CANONICAL' | 'SOURCE' | 'MERGE';
}

const CHART_INCLUDE = {
  codeAliases: true,
  primaryClinic: {
    select: {
      id: true,
      name: true,
      isActive: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  },
} satisfies Prisma.PatientInclude;

type MergeChart = Prisma.PatientGetPayload<{ include: typeof CHART_INCLUDE }>;

/** One relation, with what each side holds. */
export interface MergeRelationCount {
  key: MergeRelationKey;
  label: string;
  canonicalCount: number;
  sourceCount: number;
}

export interface MergePortalOutlook {
  canonicalLinked: boolean;
  sourceLinked: boolean;
  /** Which chart's app account keeps access, or `NONE` when neither chart has one. */
  retains: 'CANONICAL' | 'SOURCE' | 'NONE';
  canonicalPendingInvites: number;
  sourcePendingInvites: number;
  /** Pending invitations the chosen strategy cancels. */
  invitesCancelled: number;
}

export interface PatientMergeEvaluation {
  canonical: MergeChart;
  source: MergeChart;
  relations: MergeRelationCount[];
  portal: MergePortalOutlook;
  aliases: { carriedOver: string[]; added: string };
  tombstonePatientCode: string;
  duplicateSignal: {
    score: number;
    confidence: DuplicateConfidence;
    reasons: DuplicateMatchReason[];
  };
  findings: MergeFinding[];
  canMerge: boolean;
  fingerprint: string;
  strategies: Required<MergeStrategies>;
  /** Rows the transaction needs. Internal; the preview payload does not carry them. */
  portalRows: {
    canonicalLink: PatientAccountLink | null;
    sourceLink: PatientAccountLink | null;
    canonicalPendingInviteIds: string[];
    sourcePendingInviteIds: string[];
  };
}

/**
 * One chart, in the shape the duplicate review queue already publishes.
 *
 * Deliberately identical to `DuplicateCandidatePatient` so the web app's `buildComparisonRows`
 * renders a merge preview and a duplicate candidate with the same code. Two field-by-field
 * comparisons of two patient charts that disagree about how to show a date of birth would be a
 * worse outcome than either one alone.
 */
export interface MergePreviewPatient {
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
  clinic: { id: string; name: string; organizationId: string; organizationName: string };
}

export interface PatientMergePreview {
  generatedAt: string;
  canonical: MergePreviewPatient;
  source: MergePreviewPatient;
  duplicateSignal: {
    score: number;
    confidence: DuplicateConfidence;
    reasons: DuplicateMatchReason[];
  };
  relations: MergeRelationCount[];
  portal: MergePortalOutlook;
  aliases: { carriedOver: string[]; added: string };
  tombstonePatientCode: string;
  blockers: MergeFinding[];
  warnings: MergeFinding[];
  canMerge: boolean;
  /** Echo this back on the merge so a stale panel cannot be acted on. */
  fingerprint: string;
  strategies: Required<MergeStrategies>;
}

export interface PatientMergeResult {
  success: true;
  canonicalPatientId: string;
  canonicalPatientCode: string;
  mergedPatientId: string;
  mergedPatientCodeAlias: string;
  /** Rows moved per relation, keyed by `MERGE_RELATIONS`. */
  movedCounts: Record<string, number>;
}

/**
 * The delegate shape every relation in `MERGE_RELATIONS` satisfies.
 *
 * Indexing the Prisma client by a key from a shared constant is the whole point -- it is what
 * makes it impossible for the preview to count a relation the transaction then fails to move --
 * but the generated client has no index signature, so the cast is confined to this one helper.
 */
interface PatientScopedDelegate {
  count(args: { where: { patientId: string } }): Promise<number>;
  updateMany(args: {
    where: { patientId: string };
    data: { patientId: string };
  }): Promise<{ count: number }>;
}

function relationDelegates(
  client: PrismaService | TransactionClient,
): Record<MergeRelationKey, PatientScopedDelegate> {
  return client as unknown as Record<MergeRelationKey, PatientScopedDelegate>;
}

/**
 * The code a retired chart is renamed to.
 *
 * `Patient.patientCode` is globally unique, so the retired chart cannot keep the code it is
 * handing to the surviving one. The suffix makes the rename deterministic and readable by eye.
 */
export function buildMergedPatientCode(sourceCode: string, patientId: string): string {
  const suffix = patientId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${sourceCode}-M-${suffix}`.slice(0, 32);
}

/**
 * Merging two patient charts.
 *
 * Lifted out of `AdminService`, which had grown past a thousand lines of unrelated staff
 * lifecycle work, so that the evaluation an operator is shown and the transaction that acts on it
 * sit beside each other and cannot drift apart. `AdminService.mergePatients` still exists and
 * delegates here, so `POST /admin/patients/merge` and its callers are unchanged.
 *
 * Every refusal is raised through `@nkwapa/db`'s finding vocabulary rather than as a bare string,
 * so an operator reads the same wording whether they meet it in the preview or on submit.
 */
@Injectable()
export class PatientMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * What a merge would do. Read-only, so it can be opened as often as an operator likes.
   *
   * System-admin only, matching the merge it describes: this reports how much clinical history
   * sits on each chart, a wider identity view than the side-by-side comparison the duplicate
   * review queue gives a clinic manager.
   */
  async evaluate(
    actor: MergeActor,
    canonicalPatientId: string,
    sourcePatientId: string,
    options?: MergeStrategies,
  ): Promise<PatientMergeEvaluation> {
    this.assertSystemAdmin(actor);

    if (canonicalPatientId === sourcePatientId) {
      throw new BadRequestException(this.refusal(mergeFinding('SAME_PATIENT')));
    }

    const [canonical, source] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { id: canonicalPatientId },
        include: CHART_INCLUDE,
      }),
      this.prisma.patient.findUnique({ where: { id: sourcePatientId }, include: CHART_INCLUDE }),
    ]);

    if (!canonical || !source) {
      throw new NotFoundException(this.refusal(mergeFinding('PATIENT_NOT_FOUND')));
    }

    return this.evaluateCharts(canonical, source, options);
  }

  /**
   * The read-only panel an operator reads before committing.
   *
   * A projection of `evaluate`, with the raw rows the transaction needs left behind. Recomputed
   * on every call rather than stored: a preview that could go stale without saying so is the
   * thing this endpoint exists to prevent, and `fingerprint` is how a client proves it acted on
   * what it was shown.
   */
  async preview(
    actor: MergeActor,
    canonicalPatientId: string,
    sourcePatientId: string,
    options?: MergeStrategies,
  ): Promise<PatientMergePreview> {
    const evaluation = await this.evaluate(actor, canonicalPatientId, sourcePatientId, options);

    return {
      generatedAt: new Date().toISOString(),
      canonical: toPreviewPatient(evaluation.canonical),
      source: toPreviewPatient(evaluation.source),
      duplicateSignal: evaluation.duplicateSignal,
      relations: evaluation.relations,
      portal: evaluation.portal,
      aliases: evaluation.aliases,
      tombstonePatientCode: evaluation.tombstonePatientCode,
      blockers: evaluation.findings.filter((finding) => finding.severity === 'BLOCK'),
      warnings: evaluation.findings.filter((finding) => finding.severity === 'WARN'),
      canMerge: evaluation.canMerge,
      fingerprint: evaluation.fingerprint,
      strategies: evaluation.strategies,
    };
  }

  /**
   * Consolidate the duplicate into the canonical chart.
   *
   * Refuses on any blocker the evaluation raised, and refuses a stale `expectedFingerprint` so an
   * operator cannot commit against a preview that a concurrent edit has made untrue. Everything
   * that changes happens in one transaction, including the record of what changed.
   */
  async merge(
    actor: MergeActor,
    canonicalPatientId: string,
    sourcePatientId: string,
    options?: MergeStrategies & { expectedFingerprint?: string },
    requestId?: string,
  ): Promise<PatientMergeResult> {
    const evaluation = await this.evaluate(actor, canonicalPatientId, sourcePatientId, options);

    const blockers = evaluation.findings.filter((finding) => finding.severity === 'BLOCK');
    if (blockers.length > 0) {
      throw new ConflictException(this.refusal(blockers[0], evaluation.findings));
    }

    if (options?.expectedFingerprint && options.expectedFingerprint !== evaluation.fingerprint) {
      throw new ConflictException({
        code: 'PATIENT_MERGE_PREVIEW_STALE',
        message: 'One of these charts changed after the preview was taken.',
        recoveryAction: 'Close this and preview the merge again before continuing.',
      });
    }

    const { canonical, source, portalRows, strategies } = evaluation;
    const mergedAt = new Date();
    const sourceLegacyCode = source.patientCode;

    // Preserved verbatim from the original implementation: an explicit SOURCE strategy wins, and
    // otherwise the surviving chart's own account is kept before the duplicate's.
    const retainedPortalLink =
      strategies.portalLinkStrategy === 'SOURCE' && portalRows.sourceLink
        ? portalRows.sourceLink
        : (portalRows.canonicalLink ?? portalRows.sourceLink ?? null);
    const retainedPortalUser = retainedPortalLink
      ? await this.prisma.user.findUnique({
          where: { keycloakSub: retainedPortalLink.keycloakSub },
          select: { id: true },
        })
      : null;
    const retainedPortalUserId =
      strategies.portalLinkStrategy === 'SOURCE' && source.portalUserId
        ? source.portalUserId
        : (canonical.portalUserId ?? source.portalUserId ?? retainedPortalUser?.id ?? null);

    const movedCounts = await this.prisma.$transaction(async (tx) => {
      await this.assertStillMergeable(tx, canonical, source);

      const counts: Record<string, number> = {};
      const delegates = relationDelegates(tx);

      /*
        Driven by the shared list rather than a hand-written sequence of updateMany calls.

        The original moved eight relations and silently left seven behind -- clinical notes,
        medical history, medication and pharmacy records among them -- so a merged chart carried
        notes whose encounter pointed at the surviving record while the note itself still pointed
        at the retired one. Iterating MERGE_RELATIONS is what makes adding a relation to the
        preview and forgetting to move it impossible.
      */
      for (const relation of MERGE_RELATIONS) {
        const { count } = await delegates[relation.key].updateMany({
          where: { patientId: source.id },
          data: { patientId: canonical.id },
        });
        counts[relation.key] = count;
      }

      // A chart already merged into the duplicate must follow it, or its alias chain terminates
      // at a retired record.
      const rechained = await tx.patient.updateMany({
        where: { mergedIntoPatientId: source.id },
        data: { mergedIntoPatientId: canonical.id },
      });
      counts.mergedSourcePatients = rechained.count;

      // A decision about "are these two the same person" is answered by the merge itself. The
      // queue recomputes candidates from live charts and excludes retired ones, so any pair still
      // worth reviewing resurfaces against the surviving chart on its own.
      const reviews = await tx.patientDuplicateReview.deleteMany({
        where: { OR: [{ patientAId: source.id }, { patientBId: source.id }] },
      });
      counts.patientDuplicateReview = reviews.count;

      await tx.patientAccountLink.deleteMany({
        where: { patientId: { in: [canonical.id, source.id] } },
      });
      if (retainedPortalLink) {
        await tx.patientAccountLink.create({
          data: { patientId: canonical.id, keycloakSub: retainedPortalLink.keycloakSub },
        });
      }

      // Cancel whichever side's unclaimed invitation the strategy gives up. Only PENDING rows are
      // touched: a claimed or already-expired invitation is history, not a live offer.
      const cancelledInviteIds =
        strategies.inviteStrategy === 'CANONICAL'
          ? portalRows.sourcePendingInviteIds
          : strategies.inviteStrategy === 'SOURCE'
            ? portalRows.canonicalPendingInviteIds
            : [];
      if (cancelledInviteIds.length > 0) {
        await tx.patientPortalInvite.updateMany({
          where: { id: { in: cancelledInviteIds } },
          data: { status: 'CANCELLED', cancelledAt: mergedAt },
        });
      }

      /*
        Every invitation moves, whatever state it is in.

        The CANONICAL branch used to repoint only the duplicate's PENDING invitations, so a
        claimed or expired one stayed on the retired chart -- a record of a real exchange with
        this patient that the surviving chart would then never show. Same defect as the seven
        stranded relations above, in a table the original loop did touch.
      */
      const movedInvites = await tx.patientPortalInvite.updateMany({
        where: { patientId: source.id },
        data: { patientId: canonical.id },
      });
      counts.patientPortalInvite = movedInvites.count;

      let carriedAliases = 0;
      if (source.codeAliases.length > 0) {
        const created = await tx.patientCodeAlias.createMany({
          data: source.codeAliases.map((alias) => ({
            patientId: canonical.id,
            code: alias.code,
          })),
          skipDuplicates: true,
        });
        carriedAliases = created.count;
        await tx.patientCodeAlias.deleteMany({ where: { patientId: source.id } });
      }

      await tx.patient.update({
        where: { id: canonical.id },
        data: { portalUserId: retainedPortalUserId },
      });

      await tx.patient.update({
        where: { id: source.id },
        data: {
          patientCode: evaluation.tombstonePatientCode,
          portalUserId: null,
          mergedIntoPatientId: canonical.id,
          mergedAt,
          mergedByUserId: actor.userId,
        },
      });

      // Upsert, not create. `PatientCodeAlias.code` is globally unique, and the surviving chart
      // may already answer to this code from an earlier merge of the same pair's history; a bare
      // create turned that into a raw Prisma error with no recoverable wording.
      await tx.patientCodeAlias.upsert({
        where: { code: sourceLegacyCode },
        create: { patientId: canonical.id, code: sourceLegacyCode },
        update: { patientId: canonical.id },
      });
      // Measured, not assumed: skipDuplicates means an alias the surviving chart already answered
      // to is not inserted again, and a count that over-reports is worse than none.
      counts.patientCodeAlias = carriedAliases + 1;

      if (retainedPortalUserId) {
        await tx.userClinicRole.upsert({
          where: {
            userId_clinicId_role: {
              userId: retainedPortalUserId,
              clinicId: canonical.primaryClinicId,
              role: UserRole.PATIENT,
            },
          },
          create: {
            userId: retainedPortalUserId,
            clinicId: canonical.primaryClinicId,
            role: UserRole.PATIENT,
          },
          update: {},
        });
      }

      await tx.patientMergeRecord.create({
        data: {
          clinicId: canonical.primaryClinicId,
          canonicalPatientId: canonical.id,
          sourcePatientId: source.id,
          sourcePatientCode: sourceLegacyCode,
          tombstonePatientCode: evaluation.tombstonePatientCode,
          portalLinkStrategy: strategies.portalLinkStrategy,
          inviteStrategy: strategies.inviteStrategy,
          movedCountsJson: JSON.stringify(counts),
          warningCodesJson: JSON.stringify(
            evaluation.findings
              .filter((finding) => finding.severity === 'WARN')
              .map((finding) => finding.code),
          ),
          mergedByUserId: actor.userId,
          mergedAt,
          requestId: requestId ?? null,
        },
      });

      return counts;
    });

    await this.auditService.logWrite({
      clinicId: canonical.primaryClinicId,
      actorUserId: actor.userId,
      action: 'PATIENT.MERGE',
      entityType: 'Patient',
      entityId: canonical.id,
      beforeJson: JSON.stringify({
        canonicalPatientId: canonical.id,
        sourcePatientId: source.id,
        sourcePatientCode: sourceLegacyCode,
      }),
      afterJson: JSON.stringify({
        canonicalPatientId: canonical.id,
        sourcePatientId: source.id,
        sourcePatientCode: sourceLegacyCode,
        retainedPortalLinkKeycloakSub: retainedPortalLink?.keycloakSub ?? null,
        retainedPortalUserId,
        // What was actually moved, so a consolidated chart can be reconciled from the audit trail
        // alone rather than only from PatientMergeRecord.
        movedCounts,
      }),
      requestId,
    });

    return {
      success: true,
      canonicalPatientId: canonical.id,
      canonicalPatientCode: canonical.patientCode,
      mergedPatientId: source.id,
      mergedPatientCodeAlias: sourceLegacyCode,
      movedCounts,
    };
  }

  private async evaluateCharts(
    canonical: MergeChart,
    source: MergeChart,
    options?: MergeStrategies,
  ): Promise<PatientMergeEvaluation> {
    const strategies: Required<MergeStrategies> = {
      portalLinkStrategy: options?.portalLinkStrategy ?? 'CANONICAL',
      inviteStrategy: options?.inviteStrategy ?? 'MERGE',
    };

    const counts = relationDelegates(this.prisma);
    const [
      relations,
      canonicalLink,
      sourceLink,
      canonicalInvites,
      sourceInvites,
      canonicalOpenPharmacy,
      sourceOpenPharmacy,
      aliasCollisions,
      priorReview,
    ] = await Promise.all([
      Promise.all(
        MERGE_RELATIONS.map(async (relation): Promise<MergeRelationCount> => {
          const [canonicalCount, sourceCount] = await Promise.all([
            counts[relation.key].count({ where: { patientId: canonical.id } }),
            counts[relation.key].count({ where: { patientId: source.id } }),
          ]);
          return { key: relation.key, label: relation.label, canonicalCount, sourceCount };
        }),
      ),
      this.prisma.patientAccountLink.findUnique({ where: { patientId: canonical.id } }),
      this.prisma.patientAccountLink.findUnique({ where: { patientId: source.id } }),
      this.prisma.patientPortalInvite.findMany({ where: { patientId: canonical.id } }),
      this.prisma.patientPortalInvite.findMany({ where: { patientId: source.id } }),
      this.prisma.patientPharmacyPreference.count({
        where: { patientId: canonical.id, effectiveTo: null },
      }),
      this.prisma.patientPharmacyPreference.count({
        where: { patientId: source.id, effectiveTo: null },
      }),
      this.prisma.patientCodeAlias.findMany({
        where: {
          code: { in: [source.patientCode, ...source.codeAliases.map((alias) => alias.code)] },
          patientId: { notIn: [canonical.id, source.id] },
        },
        select: { code: true },
      }),
      this.prisma.patientDuplicateReview.findUnique({
        where: { pairKey: duplicatePairKey(canonical.id, source.id) },
        select: { status: true, note: true },
      }),
    ]);

    const canonicalPending = canonicalInvites.filter((invite) => invite.status === 'PENDING');
    const sourcePending = sourceInvites.filter((invite) => invite.status === 'PENDING');

    const retains: MergePortalOutlook['retains'] =
      strategies.portalLinkStrategy === 'SOURCE' && sourceLink
        ? 'SOURCE'
        : canonicalLink
          ? 'CANONICAL'
          : sourceLink
            ? 'SOURCE'
            : 'NONE';

    // CANONICAL keeps the surviving chart's invitation and cancels the duplicate's, SOURCE does
    // the reverse, and MERGE carries the duplicate's across and cancels nothing.
    const invitesCancelled =
      strategies.inviteStrategy === 'CANONICAL'
        ? sourcePending.length
        : strategies.inviteStrategy === 'SOURCE'
          ? canonicalPending.length
          : 0;

    const duplicateSignal = evaluateDuplicatePair(
      toDuplicateInput(canonical),
      toDuplicateInput(source),
    );

    const findings: MergeFinding[] = [];

    if (canonical.mergedIntoPatientId) findings.push(mergeFinding('CANONICAL_ALREADY_MERGED'));
    if (source.mergedIntoPatientId) findings.push(mergeFinding('SOURCE_ALREADY_MERGED'));

    if (canonical.primaryClinicId !== source.primaryClinicId) {
      findings.push(
        mergeFinding(
          'CROSS_CLINIC',
          `${canonical.primaryClinic.name} and ${source.primaryClinic.name}`,
        ),
      );
    } else if (!canonical.primaryClinic.isActive) {
      findings.push(mergeFinding('CLINIC_INACTIVE', canonical.primaryClinic.name));
    }

    if (aliasCollisions.length > 0) {
      findings.push(
        mergeFinding('ALIAS_CODE_COLLISION', aliasCollisions.map((alias) => alias.code).join(', ')),
      );
    }

    if (canonicalOpenPharmacy > 0 && sourceOpenPharmacy > 0) {
      // Enforced by PatientPharmacyPreference_one_open_per_patient_key, a partial unique index.
      // Without this check the whole transaction rolls back on a constraint the operator has no
      // way to read, part-way through an action they were told would succeed.
      findings.push(mergeFinding('OPEN_PHARMACY_PREFERENCE_CONFLICT'));
    }

    const twoAccounts =
      canonicalLink != null &&
      sourceLink != null &&
      canonicalLink.keycloakSub !== sourceLink.keycloakSub;

    if (twoAccounts && !options?.portalLinkStrategy) {
      // Two different people can sign in to these two charts. Keeping one silently locks the
      // other out of a record they have been using, so the choice has to be made deliberately.
      findings.push(mergeFinding('PORTAL_LINK_CONFLICT'));
    }
    if (twoAccounts) findings.push(mergeFinding('PORTAL_ACCOUNT_RETIRED'));

    if (invitesCancelled > 0) {
      findings.push(
        mergeFinding(
          'PENDING_INVITES_CANCELLED',
          `${invitesCancelled} invitation${invitesCancelled === 1 ? '' : 's'}`,
        ),
      );
    }

    if (duplicateSignal.confidence === 'LOW') findings.push(mergeFinding('WEAK_DUPLICATE_SIGNAL'));

    const canonicalTotal = relations.reduce((total, row) => total + row.canonicalCount, 0);
    const sourceTotal = relations.reduce((total, row) => total + row.sourceCount, 0);
    if (sourceTotal > canonicalTotal) {
      findings.push(
        mergeFinding('SOURCE_HAS_MORE_HISTORY', `${sourceTotal} records against ${canonicalTotal}`),
      );
    }

    if (priorReview?.status === 'DISMISSED') {
      findings.push(
        mergeFinding('DUPLICATE_PAIR_PREVIOUSLY_DISMISSED', priorReview.note ?? undefined),
      );
    }

    return {
      canonical,
      source,
      relations,
      portal: {
        canonicalLinked: canonicalLink != null,
        sourceLinked: sourceLink != null,
        retains,
        canonicalPendingInvites: canonicalPending.length,
        sourcePendingInvites: sourcePending.length,
        invitesCancelled,
      },
      aliases: {
        carriedOver: source.codeAliases.map((alias) => alias.code),
        added: source.patientCode,
      },
      tombstonePatientCode: buildMergedPatientCode(source.patientCode, source.id),
      duplicateSignal,
      findings,
      canMerge: !isMergeBlocked(findings),
      fingerprint: mergePreviewFingerprint({
        canonicalPatientId: canonical.id,
        sourcePatientId: source.id,
        canonicalUpdatedAt: canonical.updatedAt,
        sourceUpdatedAt: source.updatedAt,
        canonicalPatientCode: canonical.patientCode,
        sourcePatientCode: source.patientCode,
        counts: Object.fromEntries(
          relations.flatMap((row) => [
            [`${row.key}:canonical`, row.canonicalCount],
            [`${row.key}:source`, row.sourceCount],
          ]),
        ),
      }),
      strategies,
      portalRows: {
        canonicalLink,
        sourceLink,
        canonicalPendingInviteIds: canonicalPending.map((invite) => invite.id),
        sourcePendingInviteIds: sourcePending.map((invite) => invite.id),
      },
    };
  }

  /**
   * The three conditions that must still hold at commit time.
   *
   * The evaluation reads a snapshot taken before the transaction opened, and the preview widens
   * that window further by putting a person's reading time inside it. Re-reading the full
   * evaluation here would hold locks for thirty more queries; these three are the ones a
   * concurrent merge or a clinic transfer can actually invalidate.
   */
  private async assertStillMergeable(
    tx: TransactionClient,
    canonical: MergeChart,
    source: MergeChart,
  ) {
    const [freshCanonical, freshSource] = await Promise.all([
      tx.patient.findUnique({
        where: { id: canonical.id },
        select: { mergedIntoPatientId: true, primaryClinicId: true },
      }),
      tx.patient.findUnique({
        where: { id: source.id },
        select: { mergedIntoPatientId: true, primaryClinicId: true },
      }),
    ]);

    if (!freshCanonical || !freshSource) {
      throw new NotFoundException(this.refusal(mergeFinding('PATIENT_NOT_FOUND')));
    }
    if (freshCanonical.mergedIntoPatientId) {
      throw new ConflictException(this.refusal(mergeFinding('CANONICAL_ALREADY_MERGED')));
    }
    if (freshSource.mergedIntoPatientId) {
      throw new ConflictException(this.refusal(mergeFinding('SOURCE_ALREADY_MERGED')));
    }
    if (freshCanonical.primaryClinicId !== freshSource.primaryClinicId) {
      throw new ConflictException(this.refusal(mergeFinding('CROSS_CLINIC')));
    }
  }

  private assertSystemAdmin(actor: MergeActor) {
    if (!isSystemAdmin(actor.roles)) {
      throw new ForbiddenException({
        code: 'PATIENT_MERGE_FORBIDDEN',
        message: 'Only System Admin can merge patient records',
        recoveryAction:
          'Record what you found in the duplicate review queue, and ask a system administrator to consolidate the charts.',
      });
    }
  }

  /** A refusal, in the shape `ApiExceptionFilter` turns into a coded error body. */
  private refusal(finding: MergeFinding, findings: MergeFinding[] = [finding]) {
    return {
      code: 'PATIENT_MERGE_BLOCKED',
      message: finding.label,
      recoveryAction: finding.recovery,
      details: { blockers: findings.filter((entry) => entry.severity === 'BLOCK') },
    };
  }
}

function toPreviewPatient(chart: MergeChart): MergePreviewPatient {
  return {
    id: chart.id,
    patientCode: chart.patientCode,
    firstName: chart.firstName,
    lastName: chart.lastName,
    dob: chart.dob ? chart.dob.toISOString() : null,
    sex: chart.sex,
    phoneE164: chart.phoneE164,
    email: chart.email,
    nationalIdType: chart.nationalIdType,
    nationalIdLast4: chart.nationalIdLast4,
    portalLinked: chart.portalUserId !== null,
    createdAt: chart.createdAt.toISOString(),
    updatedAt: chart.updatedAt.toISOString(),
    clinic: {
      id: chart.primaryClinic.id,
      name: chart.primaryClinic.name,
      organizationId: chart.primaryClinic.organizationId,
      organizationName: chart.primaryClinic.organization.name,
    },
  };
}

function toDuplicateInput(chart: MergeChart) {
  return {
    id: chart.id,
    firstName: chart.firstName,
    lastName: chart.lastName,
    dob: chart.dob,
    phoneE164: chart.phoneE164,
    email: chart.email,
    nationalIdHash: chart.nationalIdHash,
    nationalIdType: chart.nationalIdType,
    nationalIdLast4: chart.nationalIdLast4,
  };
}
