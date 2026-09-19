import { describeAdherence, type MedicationAdherenceEntry } from '@nkwapa/db';

/**
 * What the generated note says about one medication.
 *
 * The narrative generators have taken a `medications` list since they were written and nothing has
 * ever supplied one, so every note has said "No blood-pressure medications were recorded for this
 * visit" regardless of what the patient was on. This is the source: the reconciled medication the
 * volunteer had on screen, plus what they observed about it.
 */
export interface AdherenceNarrativeRow {
  entry: MedicationAdherenceEntry;
  medicationName: string;
  strength: string | null;
  dose: string | null;
  doseUnit: string | null;
  frequency: string | null;
}

/**
 * Render one line per medication, in a fixed order.
 *
 * Deterministic by contract, because a signed note is hashed and pressing the button twice has to
 * produce the same text: no locale formatting, no clock, no randomness, and the rows sorted by
 * medication name rather than by whatever order the database returned. A medication with nothing
 * recorded about it still appears -- the patient is on it, which is a fact the clinician needs --
 * but says only that no adherence was recorded, never that the patient denied anything.
 */
export function renderMedicationLines(rows: readonly AdherenceNarrativeRow[]): string[] {
  return [...rows]
    .sort((left, right) => compare(describeMedication(left), describeMedication(right)))
    .map((row) => {
      const clause = describeAdherence(row.entry);
      const label = describeMedication(row);
      return clause ? `${label} (${clause})` : `${label} (no adherence recorded)`;
    });
}

function describeMedication(row: AdherenceNarrativeRow): string {
  return [
    row.medicationName,
    row.strength,
    [row.dose, row.doseUnit].filter(Boolean).join(' ') || null,
    row.frequency,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Code-point ordering, not `localeCompare`.
 *
 * `localeCompare` reads the process locale, so two servers could sort the same two medications
 * differently and produce notes that differ only in paragraph order -- which a signed hash would
 * report as an edit.
 */
function compare(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
