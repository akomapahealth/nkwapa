/**
 * What a volunteer observed about one reconciled medication at one visit.
 *
 * Neither interview holds a medication name or a dose. `PatientMedicationRecord` /
 * `PatientMedicationRevision` is the patient's medication of record, and the interview reads it.
 * What is new here is the per-visit observation -- took it today, doses missed in the past week,
 * supply remaining, barriers -- which is a statement *about* a medication rather than a property
 * of it. Writing these as a revision would fill the medication history with non-changes and
 * corrupt `lastReconciledAt`.
 *
 * This module is the one definition of that observation. The Nest DTO, the offline form and the
 * note generator all import it, so a payload the form would reject is a payload the API rejects,
 * for the same reason, at the same path. Following `packages/db/src/hypertension-interview.ts`:
 * parsing returns a `PayloadIssue[]` rather than throwing, because the two consumers need the same
 * parse rendered two different ways.
 *
 * The vocabularies themselves already live in `clinical-vocabulary.ts` -- they are shared with the
 * interview's own medication section -- so nothing is redeclared here.
 */

import {
  MEDICATION_ADHERENCE_LEVELS,
  MEDICATION_ADHERENCE_LEVEL_LABELS,
  MEDICATION_DOSES_MISSED,
  MEDICATION_DOSES_MISSED_LABELS,
  MEDICATION_PROBLEMS,
  MEDICATION_PROBLEM_LABELS,
  MEDICATION_SUPPLY_STATUSES,
  MEDICATION_SUPPLY_STATUS_LABELS,
  NKWAPA_ANSWERS,
  type MedicationAdherenceLevelValue,
  type MedicationDosesMissedValue,
  type MedicationProblemValue,
  type MedicationSupplyStatusValue,
  type NkwapaAnswerValue,
} from './clinical-vocabulary';
import {
  PayloadIssues,
  readEnum,
  readEnumArray,
  readObject,
  readText,
  rejectUnknownKeys,
  type PayloadIssue,
} from './payload-contract';

export const MEDICATION_ADHERENCE_CONTEXTS = ['HYPERTENSION', 'DIABETES'] as const;
export type MedicationAdherenceContextValue = (typeof MEDICATION_ADHERENCE_CONTEXTS)[number];

export const MEDICATION_ADHERENCE_CONTEXT_LABELS: Record<MedicationAdherenceContextValue, string> =
  {
    HYPERTENSION: 'Blood pressure',
    DIABETES: 'Diabetes',
  };

/** The longest a volunteer may write in "other barrier", matching the column's VarChar(200). */
export const ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH = 200;

/**
 * One observation, as both the payload and the form value.
 *
 * `medicationRecordId` names the medication; `observedRevisionId` pins the revision that was on
 * screen when the question was answered, so a later reconciliation cannot silently re-point a
 * recorded observation at a different dose.
 */
export interface MedicationAdherenceEntry {
  medicationRecordId: string;
  observedRevisionId: string;
  /** Hypertension asks this. Diabetes leaves it at NOT_ASSESSED. */
  tookToday: NkwapaAnswerValue;
  /** Hypertension asks this. Diabetes leaves it at NOT_ASSESSED. */
  dosesMissed7d: MedicationDosesMissedValue;
  /** Diabetes asks this. Hypertension leaves it at NOT_ASSESSED. */
  takingAsPrescribed: MedicationAdherenceLevelValue;
  supplyRemaining: MedicationSupplyStatusValue;
  problems: MedicationProblemValue[];
  problemsOther: string | null;
}

/**
 * The per-entry question keys, in the order they are asked.
 *
 * `focusFirstInvalid` walks this to decide where the cursor lands after a failed save, and a test
 * asserts every validated key appears here -- a question that can fail validation but has no place
 * in the order is one the form can refuse to save without ever showing why.
 */
export const ADHERENCE_FIELD_ORDER = [
  'tookToday',
  'dosesMissed7d',
  'takingAsPrescribed',
  'supplyRemaining',
  'problems',
  'problemsOther',
] as const;

export type AdherenceFieldKey = (typeof ADHERENCE_FIELD_ORDER)[number];

/** Which questions a context actually asks. The rest are held at `NOT_ASSESSED`. */
export const ADHERENCE_FIELDS_BY_CONTEXT: Record<
  MedicationAdherenceContextValue,
  readonly AdherenceFieldKey[]
> = {
  HYPERTENSION: ['tookToday', 'dosesMissed7d', 'supplyRemaining', 'problems', 'problemsOther'],
  DIABETES: ['takingAsPrescribed', 'supplyRemaining', 'problems', 'problemsOther'],
};

export function isAdherenceFieldAsked(
  context: MedicationAdherenceContextValue,
  field: AdherenceFieldKey,
): boolean {
  return ADHERENCE_FIELDS_BY_CONTEXT[context].includes(field);
}

export function emptyAdherenceEntry(
  medicationRecordId: string,
  observedRevisionId: string,
): MedicationAdherenceEntry {
  return {
    medicationRecordId,
    observedRevisionId,
    tookToday: 'NOT_ASSESSED',
    dosesMissed7d: 'NOT_ASSESSED',
    takingAsPrescribed: 'NOT_ASSESSED',
    supplyRemaining: 'NOT_ASSESSED',
    problems: [],
    problemsOther: null,
  };
}

/**
 * Hold the other condition's questions at `NOT_ASSESSED`.
 *
 * The database says the same thing in a CHECK constraint
 * (`EncounterMedicationAdherence_context_fields_check`), deliberately: one table keeps "this
 * question does not apply here" a represented fact rather than a null that could equally mean "not
 * yet asked". Applying the rule here as well means the constraint is a backstop rather than the
 * thing that reports the bug, which would reach a volunteer as an unexplained 500.
 */
export function applyAdherenceContextRules(
  context: MedicationAdherenceContextValue,
  entry: MedicationAdherenceEntry,
): MedicationAdherenceEntry {
  if (context === 'HYPERTENSION') {
    return { ...entry, takingAsPrescribed: 'NOT_ASSESSED' };
  }
  return { ...entry, tookToday: 'NOT_ASSESSED', dosesMissed7d: 'NOT_ASSESSED' };
}

/**
 * `NONE` is an answer, and it is exclusive.
 *
 * A volunteer ticking "None" has asked about barriers and found none, which is a different fact
 * from an empty list meaning nobody asked. Holding both at once says both, so the form and the API
 * agree that the last of the two wins rather than leaving it to whichever one ran.
 */
export function normalizeAdherenceProblems(
  problems: readonly MedicationProblemValue[],
): MedicationProblemValue[] {
  const unique = MEDICATION_PROBLEMS.filter((problem) => problems.includes(problem));
  if (unique.includes('NONE')) return ['NONE'];
  return unique;
}

export interface ParsedAdherenceEntries {
  readonly context: MedicationAdherenceContextValue;
  readonly entries: readonly MedicationAdherenceEntry[];
  readonly issues: readonly PayloadIssue[];
}

/**
 * Parse and validate a whole set in one pass.
 *
 * The set, not the entry: the unique key is `(encounterId, context, medicationRecordId)` and a
 * save replaces the whole set for one encounter and one context, so a duplicate medication in the
 * payload is a contradiction the caller has to see rather than a row that quietly overwrites its
 * twin.
 */
export function parseAdherenceEntries(context: unknown, value: unknown): ParsedAdherenceEntries {
  const issues = new PayloadIssues();

  const resolvedContext = (MEDICATION_ADHERENCE_CONTEXTS as readonly string[]).includes(
    context as string,
  )
    ? (context as MedicationAdherenceContextValue)
    : 'HYPERTENSION';
  if (resolvedContext !== context) {
    issues.add('context', 'UNKNOWN_VALUE', 'Expected either HYPERTENSION or DIABETES.');
  }

  if (value === null || value === undefined) {
    return { context: resolvedContext, entries: [], issues: issues.list };
  }
  if (!Array.isArray(value)) {
    issues.add('entries', 'WRONG_TYPE', 'Expected a list of medications.');
    return { context: resolvedContext, entries: [], issues: issues.list };
  }

  const seen = new Set<string>();
  const entries: MedicationAdherenceEntry[] = [];

  value.forEach((raw, index) => {
    const prefix = `entries[${index}]`;
    const source = readObject(raw, prefix, issues);
    rejectUnknownKeys(
      source,
      ['medicationRecordId', 'observedRevisionId', ...ADHERENCE_FIELD_ORDER],
      prefix,
      issues,
    );

    const medicationRecordId = readUuid(source, 'medicationRecordId', prefix, issues);
    const observedRevisionId = readUuid(source, 'observedRevisionId', prefix, issues);
    if (!medicationRecordId || !observedRevisionId) return;

    if (seen.has(medicationRecordId)) {
      issues.add(
        `${prefix}.medicationRecordId`,
        'UNKNOWN_VALUE',
        'This medication already appears in the list.',
      );
      return;
    }
    seen.add(medicationRecordId);

    const problems = normalizeAdherenceProblems(
      readEnumArray(source, 'problems', MEDICATION_PROBLEMS, prefix, issues),
    );
    const problemsOther = readText(
      source,
      'problemsOther',
      ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH,
      prefix,
      issues,
    );

    /*
      "Other" without the text is a barrier nobody can act on, so it is refused rather than stored
      as an empty gesture. The reverse -- text without "Other" selected -- is dropped instead of
      refused: unticking the box is how a volunteer takes the answer back.
    */
    if (problems.includes('OTHER') && !problemsOther) {
      issues.add(
        `${prefix}.problemsOther`,
        'WRONG_TYPE',
        'Describe the barrier, or unselect "Other".',
      );
    }

    entries.push(
      applyAdherenceContextRules(resolvedContext, {
        medicationRecordId,
        observedRevisionId,
        tookToday: readEnum(source, 'tookToday', NKWAPA_ANSWERS, 'NOT_ASSESSED', prefix, issues),
        dosesMissed7d: readEnum(
          source,
          'dosesMissed7d',
          MEDICATION_DOSES_MISSED,
          'NOT_ASSESSED',
          prefix,
          issues,
        ),
        takingAsPrescribed: readEnum(
          source,
          'takingAsPrescribed',
          MEDICATION_ADHERENCE_LEVELS,
          'NOT_ASSESSED',
          prefix,
          issues,
        ),
        supplyRemaining: readEnum(
          source,
          'supplyRemaining',
          MEDICATION_SUPPLY_STATUSES,
          'NOT_ASSESSED',
          prefix,
          issues,
        ),
        problems,
        problemsOther: problems.includes('OTHER') ? problemsOther : null,
      }),
    );
  });

  return { context: resolvedContext, entries, issues: issues.list };
}

/** Whether any question on this entry has been answered. Drives the "not yet asked" count. */
export function isAdherenceEntryAnswered(entry: MedicationAdherenceEntry): boolean {
  return (
    entry.tookToday !== 'NOT_ASSESSED' ||
    entry.dosesMissed7d !== 'NOT_ASSESSED' ||
    entry.takingAsPrescribed !== 'NOT_ASSESSED' ||
    entry.supplyRemaining !== 'NOT_ASSESSED' ||
    entry.problems.length > 0
  );
}

/**
 * The clause the generated note renders for one medication.
 *
 * Deterministic by contract: a signed note is hashed, so no locale formatting, no clock, no
 * randomness, and a fixed clause order. An unanswered question is omitted rather than rendered as
 * a negative -- a note must never say a patient denied something nobody asked about.
 */
export function describeAdherence(entry: MedicationAdherenceEntry): string | null {
  const clauses: string[] = [];

  if (entry.tookToday === 'YES') clauses.push('took it today');
  else if (entry.tookToday === 'NO') clauses.push('did not take it today');
  else if (entry.tookToday === 'UNSURE') clauses.push('unsure whether it was taken today');

  if (entry.dosesMissed7d !== 'NOT_ASSESSED') {
    clauses.push(dosesMissedClause(entry.dosesMissed7d));
  }

  if (entry.takingAsPrescribed !== 'NOT_ASSESSED') {
    clauses.push(
      `taking as prescribed: ${MEDICATION_ADHERENCE_LEVEL_LABELS[entry.takingAsPrescribed].toLowerCase()}`,
    );
  }

  if (entry.supplyRemaining !== 'NOT_ASSESSED') {
    clauses.push(
      entry.supplyRemaining === 'NONE'
        ? 'no supply remaining'
        : entry.supplyRemaining === 'UNSURE'
          ? 'supply remaining unknown'
          : `${MEDICATION_SUPPLY_STATUS_LABELS[entry.supplyRemaining].toLowerCase()} of supply remaining`,
    );
  }

  if (entry.problems.length) {
    clauses.push(
      entry.problems.includes('NONE')
        ? 'no barriers reported'
        : `barriers: ${entry.problems
            .map((problem) =>
              problem === 'OTHER' && entry.problemsOther
                ? entry.problemsOther
                : MEDICATION_PROBLEM_LABELS[problem].toLowerCase(),
            )
            .join(', ')}`,
    );
  }

  return clauses.length ? clauses.join('; ') : null;
}

/**
 * Doses missed reads as a sentence, not as a label with a noun bolted on.
 *
 * The vocabulary labels are "0", "1", "2-3" and "4 or more", which are right for a radio group
 * and wrong in prose: "1 doses missed" is the sort of thing a clinician notices before they notice
 * the number.
 */
function dosesMissedClause(value: MedicationDosesMissedValue): string {
  if (value === 'UNSURE') return 'unsure how many doses were missed in the past week';
  if (value === 'ZERO') return 'no doses missed in the past week';
  if (value === 'ONE') return '1 dose missed in the past week';
  return `${MEDICATION_DOSES_MISSED_LABELS[value]} doses missed in the past week`;
}

/**
 * A uuid read that reports rather than throws.
 *
 * `readText` would accept any string, and these two values are foreign keys: a malformed one
 * reaches Prisma as a database error rather than a field the form can point at.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readUuid(
  source: Record<string, unknown>,
  key: string,
  prefix: string,
  issues: PayloadIssues,
): string | null {
  const raw = source[key];
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim())) {
    issues.add(`${prefix}.${key}`, 'WRONG_TYPE', 'Expected an identifier.');
    return null;
  }
  return raw.trim();
}
