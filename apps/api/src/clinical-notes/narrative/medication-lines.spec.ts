import { renderMedicationLines, type AdherenceNarrativeRow } from './medication-lines';
import type { MedicationAdherenceEntry } from '@nkwapa/db';

function row(
  medicationName: string,
  entry: Partial<MedicationAdherenceEntry> = {},
  medication: Partial<AdherenceNarrativeRow> = {},
): AdherenceNarrativeRow {
  return {
    medicationName,
    strength: '10mg',
    dose: null,
    doseUnit: null,
    frequency: 'once daily',
    ...medication,
    entry: {
      medicationRecordId: 'record-1',
      observedRevisionId: 'revision-1',
      tookToday: 'NOT_ASSESSED',
      dosesMissed7d: 'NOT_ASSESSED',
      takingAsPrescribed: 'NOT_ASSESSED',
      supplyRemaining: 'NOT_ASSESSED',
      problems: [],
      problemsOther: null,
      ...entry,
    } as MedicationAdherenceEntry,
  };
}

describe('generated medication lines', () => {
  it('names the medication and what was observed about it', () => {
    expect(
      renderMedicationLines([
        row('Amlodipine', {
          tookToday: 'YES',
          dosesMissed7d: 'ONE',
          supplyRemaining: 'LESS_THAN_ONE_WEEK',
        }),
      ]),
    ).toEqual([
      'Amlodipine 10mg once daily (took it today; 1 dose missed in the past week; less than 1 week of supply remaining)',
    ]);
  });

  it('names a medication with nothing recorded rather than dropping it', () => {
    // The patient is on it, which is a fact the clinician needs even when nobody got to the
    // adherence questions.
    expect(renderMedicationLines([row('Losartan')])).toEqual([
      'Losartan 10mg once daily (no adherence recorded)',
    ]);
  });

  it('never states a negative for a question nobody asked', () => {
    const [line] = renderMedicationLines([row('Losartan', { supplyRemaining: 'NONE' })]);
    expect(line).toContain('no supply remaining');
    expect(line).not.toContain('today');
    expect(line).not.toContain('doses missed');
  });

  /*
    A signed note is hashed, so two renders of the same record have to be byte-identical. Sorting
    by the rendered label rather than by whatever order the database returned is what makes that
    true when a medication is added and the row order changes.
  */
  it('is byte-identical regardless of the order the rows arrive in', () => {
    const rows = [row('Losartan'), row('Amlodipine'), row('Hydrochlorothiazide')];
    expect(renderMedicationLines(rows)).toEqual(renderMedicationLines([...rows].reverse()));
  });

  it('orders by the rendered label', () => {
    expect(renderMedicationLines([row('Losartan'), row('Amlodipine')])).toEqual([
      expect.stringContaining('Amlodipine'),
      expect.stringContaining('Losartan'),
    ]);
  });

  it('skips the parts of a dose the record does not carry', () => {
    expect(
      renderMedicationLines([
        row('Metformin', {}, { strength: null, dose: '1', doseUnit: 'tablet', frequency: null }),
      ]),
    ).toEqual(['Metformin 1 tablet (no adherence recorded)']);
  });

  it('renders nothing when the encounter has no medications', () => {
    // The narrative then falls through to its own "none recorded" branch, which is the honest
    // statement: no medications were reconciled, rather than none were asked about.
    expect(renderMedicationLines([])).toEqual([]);
  });
});
