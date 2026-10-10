import {
  applyAdherenceContextRules,
  isAdherenceEntryAnswered,
  normalizeAdherenceProblems,
  parseAdherenceEntries,
  type MedicationAdherenceContextValue,
  type MedicationAdherenceEntry,
  type MedicationProblemValue,
} from '@nkwapa/db';
import { isCategoryForCondition } from '@nkwapa/db/medication-classes';
import type { MedicationAdherenceEntryRecord, MedicationAdherenceSetRecord, NkwapaDb } from './db';
import type { MedicationRecord } from './medication-reconciliation';
import { claimEncounterRecord } from './encounter-record';

export type { MedicationAdherenceContextValue, MedicationAdherenceEntry };

/**
 * Which medications a condition's section shows, and in which group.
 *
 * `Drug.category` cannot fully answer "is this a blood-pressure medication" -- it mixes indication
 * with pharmacologic class, has no member for ACE inhibitors, ARBs or calcium channel blockers,
 * and a free-text row has no drug at all. `packages/db/src/medication-classes.ts` documents that
 * in full. The consequence here is that the second group is not a fallback, it is where most real
 * medications will sit, and nothing is ever hidden because of a category.
 *
 * Offline there is no drug catalogue on the device at all, so every row lands in the second group.
 * That is why the section labels the groups rather than asserting a clinical claim about them.
 */
export interface GroupedMedications {
  forCondition: MedicationRecord[];
  other: MedicationRecord[];
  /** True when no row carried a category, so the two groups say nothing and are rendered as one. */
  categoriesUnavailable: boolean;
}

export function groupMedicationsForCondition(
  records: readonly MedicationRecord[],
  condition: MedicationAdherenceContextValue,
): GroupedMedications {
  const current = records.filter((record) => record.currentRevision.status === 'CURRENT');
  const categoriesUnavailable = current.every((record) => !record.currentRevision.drug?.category);

  if (categoriesUnavailable) {
    return { forCondition: [], other: current, categoriesUnavailable: true };
  }

  return {
    forCondition: current.filter((record) =>
      isCategoryForCondition(record.currentRevision.drug?.category, condition),
    ),
    other: current.filter(
      (record) => !isCategoryForCondition(record.currentRevision.drug?.category, condition),
    ),
    categoriesUnavailable: false,
  };
}

/**
 * Seed one entry per current medication, keeping whatever has already been answered.
 *
 * Keyed on the medication rather than on position, so reordering the reconciled list -- or adding
 * one mid-visit -- never moves a volunteer's answers onto a different drug. A medication that has
 * left the list loses its entry, which is the same rule the server applies on write.
 */
export function seedAdherenceEntries(
  medications: readonly MedicationRecord[],
  existing: readonly MedicationAdherenceEntry[],
  context: MedicationAdherenceContextValue,
): MedicationAdherenceEntry[] {
  const byRecordId = new Map(existing.map((entry) => [entry.medicationRecordId, entry]));

  return medications.map((medication) => {
    const previous = byRecordId.get(medication.id);
    const base: MedicationAdherenceEntry = {
      medicationRecordId: medication.id,
      /*
        Always the revision on screen now, not the one the answer was first recorded against.

        If the medication was reconciled since, the volunteer is looking at the new dose and the
        answer they are about to save is about that. Keeping the old id would make the record claim
        an observation was made against a dose nobody was shown.
      */
      observedRevisionId: medication.currentRevisionId,
      tookToday: previous?.tookToday ?? 'NOT_ASSESSED',
      dosesMissed7d: previous?.dosesMissed7d ?? 'NOT_ASSESSED',
      takingAsPrescribed: previous?.takingAsPrescribed ?? 'NOT_ASSESSED',
      supplyRemaining: previous?.supplyRemaining ?? 'NOT_ASSESSED',
      problems: previous?.problems ?? [],
      problemsOther: previous?.problemsOther ?? null,
    };
    return applyAdherenceContextRules(context, base);
  });
}

export function updateAdherenceEntry(
  entries: readonly MedicationAdherenceEntry[],
  medicationRecordId: string,
  patch: Partial<MedicationAdherenceEntry>,
  context: MedicationAdherenceContextValue,
): MedicationAdherenceEntry[] {
  return entries.map((entry) =>
    entry.medicationRecordId === medicationRecordId
      ? applyAdherenceContextRules(context, {
          ...entry,
          ...patch,
          problems: normalizeAdherenceProblems(patch.problems ?? entry.problems),
        })
      : entry,
  );
}

/** Per-field errors keyed the way the form renders them: `<medicationRecordId>.<field>`. */
export type AdherenceFieldErrors = Record<string, string>;

/**
 * Validate through the shared contract, then re-key the issues for the form.
 *
 * `parseAdherenceEntries` reports by payload path (`entries[2].problemsOther`), which is right for
 * an API error and useless to a form whose controls are keyed by medication -- index 2 is only the
 * right control while nothing has been added or removed.
 */
export function validateAdherenceEntries(
  entries: readonly MedicationAdherenceEntry[],
  context: MedicationAdherenceContextValue,
): AdherenceFieldErrors {
  const parsed = parseAdherenceEntries(context, entries);
  const errors: AdherenceFieldErrors = {};

  for (const issue of parsed.issues) {
    const match = /^entries\[(\d+)\]\.(.+)$/.exec(issue.path);
    if (!match) continue;
    const entry = entries[Number(match[1])];
    if (!entry) continue;
    errors[`${entry.medicationRecordId}.${match[2]}`] = issue.message;
  }

  return errors;
}

export function countAnsweredEntries(entries: readonly MedicationAdherenceEntry[]): number {
  return entries.filter(isAdherenceEntryAnswered).length;
}

export function toAdherencePayload(
  clinicId: string,
  encounterId: string,
  context: MedicationAdherenceContextValue,
  entries: readonly MedicationAdherenceEntry[],
) {
  return {
    clinicId,
    encounterId,
    context,
    /*
      Only the medications with something recorded.

      Sending an untouched entry would write a row asserting the question was asked and every
      answer was "not assessed", which is indistinguishable from the row not existing and costs a
      write per medication per save.
    */
    entries: entries.filter(isAdherenceEntryAnswered).map((entry) => ({ ...entry })),
  };
}

export function fromAdherenceRecord(
  record: MedicationAdherenceSetRecord | undefined,
): MedicationAdherenceEntry[] {
  if (!record?.entries?.length) return [];
  return record.entries.map((entry) => ({
    medicationRecordId: entry.medicationRecordId,
    observedRevisionId: entry.observedRevisionId,
    tookToday: entry.tookToday,
    dosesMissed7d: entry.dosesMissed7d,
    takingAsPrescribed: entry.takingAsPrescribed,
    supplyRemaining: entry.supplyRemaining,
    problems: entry.problems as MedicationProblemValue[],
    problemsOther: entry.problemsOther,
  })) as MedicationAdherenceEntry[];
}

/**
 * Regroup the server's per-medication rows into one local row per encounter and condition.
 *
 * The server stores a row per medication because that is what the unique key and the research
 * export need; the client stores the set because that is what it saves and what it renders. Doing
 * the regrouping here rather than in the component means the local shape and the outbox payload
 * are the same object, and nothing has to reassemble a bundle at save time.
 *
 * The set has no server-side identity, so the id has to be settled locally. It is claimed through
 * `claimEncounterRecord`, the same call the save makes: a pull that minted its own id would leave
 * two rows for one encounter and condition, and `.first()` on a non-unique index returns whichever
 * UUID sorts lowest -- the shape of issue #91. Whichever of the two runs first wins, and the other
 * adopts it.
 */
export async function applyAdherencePull(
  database: Pick<NkwapaDb, 'medication_adherence'>,
  rows: ReadonlyArray<Record<string, unknown>>,
  generateId: () => string = () => crypto.randomUUID(),
): Promise<void> {
  if (!rows.length) return;

  const sets = new Map<string, MedicationAdherenceSetRecord>();

  for (const row of rows) {
    const encounterId = String(row.encounterId);
    const context = String(row.context);
    const key = `${encounterId}::${context}`;
    const updatedAt = isoOrUndefined(row.updatedAt);

    const existing = sets.get(key);
    const set: MedicationAdherenceSetRecord = existing ?? {
      // Replaced below by the claimed id, which needs an await this loop does not have.
      id: key,
      clinicId: String(row.clinicId),
      encounterId,
      context,
      entries: [],
      createdAt: isoOrUndefined(row.createdAt),
      updatedAt,
    };

    set.entries.push({
      medicationRecordId: String(row.medicationRecordId),
      observedRevisionId: String(row.observedRevisionId),
      tookToday: String(row.tookToday),
      dosesMissed7d: String(row.dosesMissed7d),
      takingAsPrescribed: String(row.takingAsPrescribed),
      supplyRemaining: String(row.supplyRemaining),
      problems: Array.isArray(row.problems) ? row.problems.map(String) : [],
      problemsOther: row.problemsOther == null ? null : String(row.problemsOther),
    });

    // The set is as fresh as its freshest row, so a later pull does not look stale to the form.
    if (updatedAt && (!set.updatedAt || updatedAt > set.updatedAt)) set.updatedAt = updatedAt;
    sets.set(key, set);
  }

  for (const set of sets.values()) {
    const claimed = await claimEncounterRecord(
      database.medication_adherence,
      set.encounterId,
      generateId,
      (record: MedicationAdherenceSetRecord) => record.context === set.context,
    );
    await database.medication_adherence.put({
      ...set,
      id: claimed.id,
      // Preserved, not restamped: the pull is not the moment the record came into existence.
      createdAt: claimed.createdAt ?? set.createdAt,
    } as never);
  }
}

function isoOrUndefined(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : undefined;
}

export type { MedicationAdherenceEntryRecord, MedicationAdherenceSetRecord };
