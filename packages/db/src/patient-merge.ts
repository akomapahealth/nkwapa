/**
 * What a patient merge would do, in one place both sides can read.
 *
 * Merging two charts is the only action in this product that cannot be undone from the product.
 * The API computes a preview with these definitions and executes the merge from the same list;
 * the web app labels the preview with them. Keeping the relation list, the refusal codes and the
 * operator-facing wording in one module is what stops a preview from promising something the
 * transaction does not do -- which, for an irreversible action, is worse than having no preview.
 *
 * Nothing here talks to a database or reads a Prisma client. It is a description of the merge,
 * and it is deliberately importable from a browser bundle.
 */

/**
 * The relations the merge repoints wholesale, keyed by Prisma model delegate.
 *
 * Every one of these is a plain `updateMany({ where: { patientId: source }, data: { patientId:
 * canonical } })`. Three further tables carrying `patientId` are absent on purpose and are listed
 * in `MERGE_SPECIAL_CASE_MODELS`, because what happens to them depends on a choice the operator
 * makes rather than on the merge alone.
 *
 * `patient-merge.spec.ts` parses `schema.prisma` and fails if a model gains a `patientId` without
 * appearing in one of those two lists. A relation that is silently left behind puts clinical
 * records on a chart nobody browses, which is exactly the defect this list exists to prevent.
 */
export const MERGE_RELATIONS = [
  { key: 'encounter', label: 'Visits' },
  { key: 'patientConsent', label: 'Consent records' },
  { key: 'clinicalNote', label: 'Clinical notes' },
  { key: 'medicalHistoryRecord', label: 'Medical history entries' },
  { key: 'patientMedicationRecord', label: 'Medication lists' },
  { key: 'medicationReconciliationEvent', label: 'Medication reviews' },
  { key: 'patientPharmacyRecord', label: 'Pharmacy records' },
  { key: 'patientPharmacyPreference', label: 'Preferred pharmacy periods' },
  { key: 'patientMeasurement', label: 'Measurements' },
  { key: 'patientSelfReport', label: 'Patient-reported updates' },
  { key: 'patientCheckIn', label: 'Clinic check-ins' },
  { key: 'appointment', label: 'Appointments' },
  { key: 'appointmentRequest', label: 'Appointment requests' },
  { key: 'reminder', label: 'Reminders and messages' },
] as const satisfies readonly { key: string; label: string }[];

export type MergeRelationKey = (typeof MERGE_RELATIONS)[number]['key'];

/**
 * Prisma models that carry `patientId` but are not moved by the loop above, with the reason.
 *
 * The same shape `rls-coverage.spec.ts` uses for its bootstrap exemptions: an exemption has to be
 * written down and justified before the test will accept it.
 */
export const MERGE_SPECIAL_CASE_MODELS: Record<string, string> = {
  PatientAccountLink:
    'One row per chart by unique constraint, so the two are collapsed into one according to the portal link strategy rather than moved.',
  PatientPortalInvite:
    'A pending invitation on the losing chart is cancelled rather than carried across, and which chart loses depends on the invite strategy.',
  PatientCodeAlias:
    'Aliases move, and the source chart contributes one further alias for the code it is giving up, so the count is not a plain repoint.',
};

/** Refusals. Any one of these means the merge does not run. */
export const MERGE_BLOCKER_CODES = [
  'SAME_PATIENT',
  'PATIENT_NOT_FOUND',
  'CANONICAL_ALREADY_MERGED',
  'SOURCE_ALREADY_MERGED',
  'CROSS_CLINIC',
  'CLINIC_INACTIVE',
  'ALIAS_CODE_COLLISION',
  'OPEN_PHARMACY_PREFERENCE_CONFLICT',
  'PORTAL_LINK_CONFLICT',
] as const;

export type MergeBlockerCode = (typeof MERGE_BLOCKER_CODES)[number];

/** Consequences worth reading before committing, none of which stops the merge. */
export const MERGE_WARNING_CODES = [
  'PORTAL_ACCOUNT_RETIRED',
  'PENDING_INVITES_CANCELLED',
  'WEAK_DUPLICATE_SIGNAL',
  'SOURCE_HAS_MORE_HISTORY',
  'DUPLICATE_PAIR_PREVIOUSLY_DISMISSED',
] as const;

export type MergeWarningCode = (typeof MERGE_WARNING_CODES)[number];

export type MergeFindingCode = MergeBlockerCode | MergeWarningCode;

/**
 * What each finding means, in the words a clinic operator would use.
 *
 * The design system forbids system vocabulary on screen, so no enum value is ever rendered. These
 * read as statements about the two charts rather than as error names.
 */
export const MERGE_FINDING_LABELS: Record<MergeFindingCode, string> = {
  SAME_PATIENT: 'This is the same chart on both sides',
  PATIENT_NOT_FOUND: 'One of these charts no longer exists',
  CANONICAL_ALREADY_MERGED: 'The chart you are keeping has already been merged into another one',
  SOURCE_ALREADY_MERGED: 'The duplicate chart has already been merged into another one',
  CROSS_CLINIC: 'These charts belong to different clinics',
  CLINIC_INACTIVE: 'The clinic that owns these charts is no longer active',
  ALIAS_CODE_COLLISION: 'The duplicate chart’s code is already recorded against another chart',
  OPEN_PHARMACY_PREFERENCE_CONFLICT: 'Both charts have a current preferred pharmacy',
  PORTAL_LINK_CONFLICT: 'Each chart is linked to a different app account',
  PORTAL_ACCOUNT_RETIRED: 'One app account will lose access to this chart',
  PENDING_INVITES_CANCELLED: 'A portal invitation that has not been used yet will be cancelled',
  WEAK_DUPLICATE_SIGNAL: 'These two charts do not look much alike',
  SOURCE_HAS_MORE_HISTORY: 'The duplicate chart holds more history than the one you are keeping',
  DUPLICATE_PAIR_PREVIOUSLY_DISMISSED: 'Someone already decided these are two different people',
};

/**
 * What to do about it.
 *
 * Every finding names a next step, because a refusal an operator cannot act on sends them to
 * support, and being able to decide without support is the whole point of the preview.
 */
export const MERGE_FINDING_RECOVERY: Record<MergeFindingCode, string> = {
  SAME_PATIENT: 'Choose a different chart as the duplicate.',
  PATIENT_NOT_FOUND: 'Reload the chart and search for the duplicate again.',
  CANONICAL_ALREADY_MERGED:
    'Open the chart it was merged into and start again from there, since that is now the surviving record.',
  SOURCE_ALREADY_MERGED:
    'Its records already live on another chart. Open that chart to check whether anything is still outstanding.',
  CROSS_CLINIC:
    'Charts can only be merged inside one clinic. Record the pair in the duplicate review queue and raise it with both clinics.',
  CLINIC_INACTIVE: 'Reactivate the clinic before consolidating any of its charts.',
  ALIAS_CODE_COLLISION:
    'Another chart already answers to this code. Ask a system administrator to check which chart is meant to hold it before merging.',
  OPEN_PHARMACY_PREFERENCE_CONFLICT:
    'End the preferred pharmacy period on the duplicate chart, then preview the merge again.',
  PORTAL_LINK_CONFLICT:
    'Choose which app account keeps access. The other account will no longer be able to open this chart.',
  PORTAL_ACCOUNT_RETIRED:
    'Tell the patient which sign-in still works, or invite them again after the merge.',
  PENDING_INVITES_CANCELLED: 'Send a fresh invitation from the surviving chart after the merge.',
  WEAK_DUPLICATE_SIGNAL:
    'Compare the two charts field by field before continuing, and stop if anything but the name differs.',
  SOURCE_HAS_MORE_HISTORY:
    'Consider merging the other way round, so the fuller chart is the one that survives.',
  DUPLICATE_PAIR_PREVIOUSLY_DISMISSED:
    'Check the note left on that decision in the duplicate review queue before overriding it.',
};

/** One finding, as the preview and the refused merge both report it. */
export interface MergeFinding {
  code: MergeFindingCode;
  severity: 'BLOCK' | 'WARN';
  label: string;
  recovery: string;
  /** Anything that makes the finding concrete: a chart code, a count, a clinic name. */
  detail?: string;
}

export function isMergeBlockerCode(code: MergeFindingCode): code is MergeBlockerCode {
  return (MERGE_BLOCKER_CODES as readonly string[]).includes(code);
}

/** Build a finding, taking its severity and copy from the tables above rather than a call site. */
export function mergeFinding(code: MergeFindingCode, detail?: string): MergeFinding {
  return {
    code,
    severity: isMergeBlockerCode(code) ? 'BLOCK' : 'WARN',
    label: MERGE_FINDING_LABELS[code],
    recovery: MERGE_FINDING_RECOVERY[code],
    ...(detail ? { detail } : {}),
  };
}

export function isMergeBlocked(findings: readonly MergeFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'BLOCK');
}

/**
 * The state of both charts, reduced to the things a merge decision depends on.
 *
 * Anything that changes one of these fields changes what the merge would do, so a preview taken
 * before the change must not be actionable afterwards.
 */
export interface MergeFingerprintInput {
  canonicalPatientId: string;
  sourcePatientId: string;
  canonicalUpdatedAt: Date | string;
  sourceUpdatedAt: Date | string;
  canonicalPatientCode: string;
  sourcePatientCode: string;
  /** Counts by relation key. Order is irrelevant; the digest sorts before hashing. */
  counts: Record<string, number>;
}

function toIsoInstant(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? String(value) : new Date(time).toISOString();
}

/**
 * FNV-1a, run twice with different offset bases and concatenated.
 *
 * Deliberately not `node:crypto`: this module is imported by a browser bundle, and the digest is a
 * staleness token rather than a secret -- it never needs to resist an attacker, only to change
 * when the two charts do. Two 32-bit passes give a 16-character token, which is short enough to
 * travel in a request body and wide enough that an accidental collision is not a real risk.
 */
function stableDigest(value: string): string {
  const bases = [0x811c9dc5, 0x01000193];
  return bases
    .map((base) => {
      let hash = base;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    })
    .join('');
}

/**
 * A token identifying the exact state the preview described.
 *
 * The merge endpoint accepts it and refuses if it no longer matches, so an operator cannot commit
 * a merge against a preview that a concurrent edit, a portal claim or another merge has made
 * untrue. Without it the preview widens the window between reading and acting rather than closing
 * it.
 */
export function mergePreviewFingerprint(input: MergeFingerprintInput): string {
  const counts = Object.keys(input.counts)
    .sort()
    .map((key) => `${key}=${input.counts[key]}`)
    .join(',');

  return stableDigest(
    [
      input.canonicalPatientId,
      input.sourcePatientId,
      input.canonicalPatientCode,
      input.sourcePatientCode,
      toIsoInstant(input.canonicalUpdatedAt),
      toIsoInstant(input.sourceUpdatedAt),
      counts,
    ].join('|'),
  );
}
