import {
  applyAdherencePull,
  countAnsweredEntries,
  fromAdherenceRecord,
  groupMedicationsForCondition,
  seedAdherenceEntries,
  toAdherencePayload,
  updateAdherenceEntry,
  validateAdherenceEntries,
} from './medication-adherence';
import type { MedicationRecord } from './medication-reconciliation';

const AMLODIPINE = '11111111-1111-4111-8111-111111111111';
const AMLODIPINE_REV = 'aaaaaaaa-1111-4111-8111-111111111111';
const METFORMIN = '22222222-2222-4222-8222-222222222222';
const METFORMIN_REV = 'bbbbbbbb-2222-4222-8222-222222222222';

function medication(
  id: string,
  revisionId: string,
  overrides: { category?: string | null; status?: string; name?: string } = {},
): MedicationRecord {
  return {
    id,
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    currentRevisionId: revisionId,
    recordedByUserId: 'user-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    currentRevision: {
      id: revisionId,
      recordId: id,
      revisionNumber: 1,
      medicationName: overrides.name ?? 'Amlodipine',
      status: (overrides.status ?? 'CURRENT') as never,
      sourceType: 'PATIENT_REPORTED' as never,
      authoredByUserId: 'user-1',
      createdAt: '2026-09-01T00:00:00.000Z',
      drug:
        overrides.category === undefined
          ? { id: 'drug-1', name: 'Amlodipine', category: 'ANTIHYPERTENSIVE' }
          : overrides.category === null
            ? null
            : { id: 'drug-1', name: 'Amlodipine', category: overrides.category },
    },
  } as MedicationRecord;
}

describe('grouping the reconciled list', () => {
  it('puts a condition-matched medication in the first group', () => {
    const grouped = groupMedicationsForCondition(
      [medication(AMLODIPINE, AMLODIPINE_REV)],
      'HYPERTENSION',
    );
    expect(grouped.forCondition).toHaveLength(1);
    expect(grouped.other).toHaveLength(0);
  });

  it('shows an unmatched medication rather than hiding it', () => {
    /*
      `DrugCategory` mixes indication with pharmacologic class and has no member for ACE
      inhibitors, ARBs or calcium channel blockers, so most real antihypertensives sit outside the
      filter. A medication shown that should not be is corrected in a second; one never shown is
      never noticed.
    */
    const grouped = groupMedicationsForCondition(
      [
        medication(AMLODIPINE, AMLODIPINE_REV),
        medication(METFORMIN, METFORMIN_REV, { category: 'ANTIDIABETIC' }),
      ],
      'HYPERTENSION',
    );
    expect(grouped.forCondition.map((m) => m.id)).toEqual([AMLODIPINE]);
    expect(grouped.other.map((m) => m.id)).toEqual([METFORMIN]);
  });

  it('collapses to one list when no row carries a category', () => {
    // The offline cache holds no drug catalogue, so a "Blood-pressure medications" heading over an
    // empty list would be asserting something the device cannot know.
    const grouped = groupMedicationsForCondition(
      [medication(AMLODIPINE, AMLODIPINE_REV, { category: null })],
      'HYPERTENSION',
    );
    expect(grouped.categoriesUnavailable).toBe(true);
    expect(grouped.forCondition).toHaveLength(0);
    expect(grouped.other).toHaveLength(1);
  });

  it('omits medications that are no longer current', () => {
    const grouped = groupMedicationsForCondition(
      [medication(AMLODIPINE, AMLODIPINE_REV, { status: 'STOPPED' })],
      'HYPERTENSION',
    );
    expect(grouped.forCondition).toHaveLength(0);
    expect(grouped.other).toHaveLength(0);
  });
});

describe('seeding entries', () => {
  it('keeps an answer with its medication when the list reorders', () => {
    // Keyed on the medication, not on position: adding one mid-visit must not move the answers.
    const answered = seedAdherenceEntries(
      [medication(AMLODIPINE, AMLODIPINE_REV), medication(METFORMIN, METFORMIN_REV)],
      [
        {
          medicationRecordId: METFORMIN,
          observedRevisionId: METFORMIN_REV,
          tookToday: 'YES',
          dosesMissed7d: 'NOT_ASSESSED',
          takingAsPrescribed: 'NOT_ASSESSED',
          supplyRemaining: 'NOT_ASSESSED',
          problems: [],
          problemsOther: null,
        },
      ],
      'HYPERTENSION',
    );
    expect(answered.find((e) => e.medicationRecordId === METFORMIN)?.tookToday).toBe('YES');
    expect(answered.find((e) => e.medicationRecordId === AMLODIPINE)?.tookToday).toBe(
      'NOT_ASSESSED',
    );
  });

  it('drops an entry whose medication has left the list', () => {
    const seeded = seedAdherenceEntries(
      [medication(AMLODIPINE, AMLODIPINE_REV)],
      [
        {
          medicationRecordId: METFORMIN,
          observedRevisionId: METFORMIN_REV,
          tookToday: 'YES',
          dosesMissed7d: 'NOT_ASSESSED',
          takingAsPrescribed: 'NOT_ASSESSED',
          supplyRemaining: 'NOT_ASSESSED',
          problems: [],
          problemsOther: null,
        },
      ],
      'HYPERTENSION',
    );
    expect(seeded.map((entry) => entry.medicationRecordId)).toEqual([AMLODIPINE]);
  });

  it('pins the revision currently on screen, not the one the answer was first given against', () => {
    // If the medication was reconciled since, the volunteer is looking at the new dose and the
    // answer is about that. Keeping the old id would make the record claim otherwise.
    const seeded = seedAdherenceEntries(
      [medication(AMLODIPINE, 'cccccccc-3333-4333-8333-333333333333')],
      [
        {
          medicationRecordId: AMLODIPINE,
          observedRevisionId: AMLODIPINE_REV,
          tookToday: 'YES',
          dosesMissed7d: 'NOT_ASSESSED',
          takingAsPrescribed: 'NOT_ASSESSED',
          supplyRemaining: 'NOT_ASSESSED',
          problems: [],
          problemsOther: null,
        },
      ],
      'HYPERTENSION',
    );
    expect(seeded[0].observedRevisionId).toBe('cccccccc-3333-4333-8333-333333333333');
    expect(seeded[0].tookToday).toBe('YES');
  });

  it('applies the context rules while seeding', () => {
    const seeded = seedAdherenceEntries(
      [medication(METFORMIN, METFORMIN_REV)],
      [
        {
          medicationRecordId: METFORMIN,
          observedRevisionId: METFORMIN_REV,
          tookToday: 'YES',
          dosesMissed7d: 'ONE',
          takingAsPrescribed: 'ALWAYS',
          supplyRemaining: 'NOT_ASSESSED',
          problems: [],
          problemsOther: null,
        },
      ],
      'DIABETES',
    );
    expect(seeded[0]).toMatchObject({
      tookToday: 'NOT_ASSESSED',
      dosesMissed7d: 'NOT_ASSESSED',
      takingAsPrescribed: 'ALWAYS',
    });
  });
});

describe('editing and validating', () => {
  const base = () =>
    seedAdherenceEntries([medication(AMLODIPINE, AMLODIPINE_REV)], [], 'HYPERTENSION');

  it('edits only the medication that was touched', () => {
    const entries = seedAdherenceEntries(
      [medication(AMLODIPINE, AMLODIPINE_REV), medication(METFORMIN, METFORMIN_REV)],
      [],
      'HYPERTENSION',
    );
    const next = updateAdherenceEntry(entries, AMLODIPINE, { tookToday: 'YES' }, 'HYPERTENSION');
    expect(next.find((e) => e.medicationRecordId === AMLODIPINE)?.tookToday).toBe('YES');
    expect(next.find((e) => e.medicationRecordId === METFORMIN)?.tookToday).toBe('NOT_ASSESSED');
  });

  it('clears the other barriers when None is chosen', () => {
    const next = updateAdherenceEntry(
      base(),
      AMLODIPINE,
      { problems: ['COST', 'NONE'] },
      'HYPERTENSION',
    );
    expect(next[0].problems).toEqual(['NONE']);
  });

  it('keys an error by medication rather than by payload index', () => {
    /*
      The shared parser reports `entries[0].problemsOther`, which is only the right control while
      nothing has been added or removed. The form's controls are keyed by medication.
    */
    const next = updateAdherenceEntry(base(), AMLODIPINE, { problems: ['OTHER'] }, 'HYPERTENSION');
    expect(validateAdherenceEntries(next, 'HYPERTENSION')).toEqual({
      [`${AMLODIPINE}.problemsOther`]: expect.any(String),
    });
  });

  it('finds nothing wrong with an untouched section', () => {
    // Half the interviews are saved half-answered, on every tab change.
    expect(validateAdherenceEntries(base(), 'HYPERTENSION')).toEqual({});
  });
});

describe('the outbox payload', () => {
  it('sends only the medications with something recorded', () => {
    // An untouched entry would write a row saying every answer is "not assessed", which is
    // indistinguishable from the row not existing and costs a write per medication per save.
    const entries = updateAdherenceEntry(
      seedAdherenceEntries(
        [medication(AMLODIPINE, AMLODIPINE_REV), medication(METFORMIN, METFORMIN_REV)],
        [],
        'HYPERTENSION',
      ),
      AMLODIPINE,
      { tookToday: 'YES' },
      'HYPERTENSION',
    );
    const payload = toAdherencePayload('clinic-1', 'encounter-1', 'HYPERTENSION', entries);
    expect(payload.entries.map((e) => e.medicationRecordId)).toEqual([AMLODIPINE]);
    expect(payload).toMatchObject({ clinicId: 'clinic-1', encounterId: 'encounter-1' });
  });

  it('counts a recorded "no barriers" as answered', () => {
    const entries = updateAdherenceEntry(
      seedAdherenceEntries([medication(AMLODIPINE, AMLODIPINE_REV)], [], 'HYPERTENSION'),
      AMLODIPINE,
      { problems: ['NONE'] },
      'HYPERTENSION',
    );
    expect(countAnsweredEntries(entries)).toBe(1);
  });
});

describe('applying the pull', () => {
  function fakeTable() {
    const rows: Record<string, unknown>[] = [];
    return {
      rows,
      medication_adherence: { put: jest.fn(async (row: never) => void rows.push(row)) },
    };
  }

  function serverRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'server-row-1',
      clinicId: 'clinic-1',
      encounterId: 'encounter-1',
      context: 'HYPERTENSION',
      medicationRecordId: AMLODIPINE,
      observedRevisionId: AMLODIPINE_REV,
      tookToday: 'YES',
      dosesMissed7d: 'ONE',
      takingAsPrescribed: 'NOT_ASSESSED',
      supplyRemaining: 'NONE',
      problems: ['COST'],
      problemsOther: null,
      createdAt: '2026-09-13T12:00:00.000Z',
      updatedAt: '2026-09-13T12:00:00.000Z',
      ...overrides,
    };
  }

  it('regroups per-medication rows into one set', async () => {
    const table = fakeTable();
    await applyAdherencePull(table as never, [
      serverRow(),
      serverRow({ id: 'server-row-2', medicationRecordId: METFORMIN }),
    ]);
    expect(table.rows).toHaveLength(1);
    expect((table.rows[0] as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('keeps the two conditions apart', async () => {
    const table = fakeTable();
    await applyAdherencePull(table as never, [
      serverRow(),
      serverRow({ id: 'server-row-2', context: 'DIABETES' }),
    ]);
    expect(table.rows.map((row) => (row as { id: string }).id)).toEqual([
      'encounter-1:HYPERTENSION',
      'encounter-1:DIABETES',
    ]);
  });

  it('derives the local id from the pair rather than from a server row', async () => {
    /*
      A random id would make the next pull mint a second set for the same encounter and condition,
      and `.first()` on a non-unique index returns whichever UUID sorts lowest -- the shape of
      issue #91.
    */
    const table = fakeTable();
    await applyAdherencePull(table as never, [serverRow()]);
    await applyAdherencePull(table as never, [serverRow({ id: 'a-different-server-id' })]);
    expect(new Set(table.rows.map((row) => (row as { id: string }).id)).size).toBe(1);
  });

  it('stamps the set with its freshest row', async () => {
    const table = fakeTable();
    await applyAdherencePull(table as never, [
      serverRow(),
      serverRow({
        id: 'server-row-2',
        medicationRecordId: METFORMIN,
        updatedAt: '2026-09-14T09:00:00.000Z',
      }),
    ]);
    expect(table.rows[0]).toMatchObject({ updatedAt: '2026-09-14T09:00:00.000Z' });
  });

  it('round-trips through the local record', async () => {
    const table = fakeTable();
    await applyAdherencePull(table as never, [serverRow()]);
    const entries = fromAdherenceRecord(table.rows[0] as never);
    expect(entries[0]).toMatchObject({
      medicationRecordId: AMLODIPINE,
      tookToday: 'YES',
      supplyRemaining: 'NONE',
      problems: ['COST'],
    });
  });

  it('writes nothing when the pull carries no adherence', async () => {
    const table = fakeTable();
    await applyAdherencePull(table as never, []);
    expect(table.medication_adherence.put).not.toHaveBeenCalled();
  });
});
