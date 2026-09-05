import {
  MERGE_FINDING_LABELS,
  MERGE_FINDING_RECOVERY,
  type DuplicateConfidence,
  type DuplicateMatchReason,
  type MergeFindingCode,
} from '@nkwapa/db';
import { apiFetch, readApiError, type GetToken } from '@/lib/api';
import type { DuplicateCandidatePatient } from '@/lib/patient-duplicates';

export { MERGE_FINDING_LABELS, MERGE_FINDING_RECOVERY };
export type { MergeFindingCode };

export type MergePortalLinkStrategy = 'CANONICAL' | 'SOURCE';
export type MergeInviteStrategy = 'CANONICAL' | 'SOURCE' | 'MERGE';

export interface MergeFinding {
  code: MergeFindingCode;
  severity: 'BLOCK' | 'WARN';
  label: string;
  recovery: string;
  detail?: string;
}

export interface MergeRelationCount {
  key: string;
  label: string;
  canonicalCount: number;
  sourceCount: number;
}

export interface MergePortalOutlook {
  canonicalLinked: boolean;
  sourceLinked: boolean;
  retains: 'CANONICAL' | 'SOURCE' | 'NONE';
  canonicalPendingInvites: number;
  sourcePendingInvites: number;
  invitesCancelled: number;
}

/**
 * The preview payload.
 *
 * `canonical` and `source` are deliberately `DuplicateCandidatePatient`: the API publishes both
 * charts in that exact shape so `buildComparisonRows` and `PatientComparisonTable` work here
 * without a second mapping.
 */
export interface PatientMergePreview {
  generatedAt: string;
  canonical: DuplicateCandidatePatient;
  source: DuplicateCandidatePatient;
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
  fingerprint: string;
  strategies: {
    portalLinkStrategy: MergePortalLinkStrategy;
    inviteStrategy: MergeInviteStrategy;
  };
}

export interface MergePreviewRequest {
  clinicId: string;
  canonicalPatientId: string;
  sourcePatientId: string;
  portalLinkStrategy?: MergePortalLinkStrategy;
  inviteStrategy?: MergeInviteStrategy;
}

export function mergePreviewPath(request: MergePreviewRequest): string {
  const query = new URLSearchParams({ sourcePatientId: request.sourcePatientId });
  if (request.portalLinkStrategy) query.set('portalLinkStrategy', request.portalLinkStrategy);
  if (request.inviteStrategy) query.set('inviteStrategy', request.inviteStrategy);

  return `/clinics/${encodeURIComponent(request.clinicId)}/patients/${encodeURIComponent(
    request.canonicalPatientId,
  )}/merge-preview?${query.toString()}`;
}

export async function fetchMergePreview(
  request: MergePreviewRequest,
  getToken: GetToken,
  signal?: AbortSignal,
): Promise<PatientMergePreview> {
  const response = await apiFetch(mergePreviewPath(request), {
    getToken,
    signal,
    activeClinicId: request.clinicId,
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as PatientMergePreview;
}

/**
 * Relations with something to move, plus the ones the surviving chart already holds.
 *
 * An empty row is still information -- it says the duplicate has no notes, rather than leaving an
 * operator to wonder whether notes were looked at -- but fourteen rows of zero buries the two
 * that matter. Rows where both sides are empty are dropped and counted instead.
 */
export function partitionRelations(relations: MergeRelationCount[]): {
  moving: MergeRelationCount[];
  untouched: MergeRelationCount[];
  emptyCount: number;
  totalMoving: number;
} {
  const moving = relations.filter((row) => row.sourceCount > 0);
  const untouched = relations.filter((row) => row.sourceCount === 0 && row.canonicalCount > 0);
  return {
    moving,
    untouched,
    emptyCount: relations.filter((row) => row.sourceCount === 0 && row.canonicalCount === 0).length,
    totalMoving: relations.reduce((total, row) => total + row.sourceCount, 0),
  };
}

/** "3 visits", "1 visit" — the count and its label, agreeing about number. */
export function describeCount(count: number, label: string): string {
  const singular = count === 1 ? label.replace(/s$/, '') : label;
  return `${count} ${singular.toLowerCase()}`;
}

/**
 * What the portal outcome means for the people involved.
 *
 * Written as a sentence about a person rather than a strategy name, because "CANONICAL" tells an
 * operator nothing about who will still be able to sign in tomorrow.
 */
export function describePortalOutcome(
  preview: Pick<PatientMergePreview, 'portal' | 'canonical' | 'source'>,
): string {
  const { portal, canonical, source } = preview;
  if (portal.retains === 'NONE') {
    return 'Neither chart has an app account, so nothing changes for the patient’s sign-in.';
  }
  const kept = portal.retains === 'CANONICAL' ? canonical : source;
  const other = portal.retains === 'CANONICAL' ? source : canonical;
  if (portal.canonicalLinked && portal.sourceLinked) {
    return `The app account on ${kept.patientCode} keeps access. The one on ${other.patientCode} will no longer open this chart.`;
  }
  return `The app account on ${kept.patientCode} keeps access, and will now open the combined chart.`;
}

/**
 * Whether the typed confirmation matches.
 *
 * Case and surrounding space are forgiven; nothing else is. The point is to make an operator read
 * the code of the chart they are retiring, not to test their typing.
 */
export function confirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().toUpperCase() === expected.trim().toUpperCase();
}
