import {
  ADHERENCE_FIELDS_BY_CONTEXT,
  ADHERENCE_FIELD_ORDER,
  applyAdherenceContextRules,
  describeAdherence,
  emptyAdherenceEntry,
  isAdherenceEntryAnswered,
  normalizeAdherenceProblems,
  parseAdherenceEntries,
  type MedicationAdherenceEntry,
} from './medication-adherence';

const RECORD_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_RECORD_ID = '33333333-3333-4333-8333-333333333333';

function entry(overrides: Partial<MedicationAdherenceEntry> = {}): Record<string, unknown> {
  return { ...emptyAdherenceEntry(RECORD_ID, REVISION_ID), ...overrides };
}

describe('medication adherence context rules', () => {
  it('holds the diabetes question at NOT_ASSESSED on a hypertension row', () => {
    const applied = applyAdherenceContextRules('HYPERTENSION', {
      ...emptyAdherenceEntry(RECORD_ID, REVISION_ID),
      tookToday: 'YES',
      takingAsPrescribed: 'ALWAYS',
    });
    expect(applied.takingAsPrescribed).toBe('NOT_ASSESSED');
    expect(applied.tookToday).toBe('YES');
  });

  it('holds both hypertension questions at NOT_ASSESSED on a diabetes row', () => {
    const applied = applyAdherenceContextRules('DIABETES', {
      ...emptyAdherenceEntry(RECORD_ID, REVISION_ID),
      tookToday: 'YES',
      dosesMissed7d: 'ONE',
      takingAsPrescribed: 'SOMETIMES',
    });
    expect(applied.tookToday).toBe('NOT_ASSESSED');
    expect(applied.dosesMissed7d).toBe('NOT_ASSESSED');
    expect(applied.takingAsPrescribed).toBe('SOMETIMES');
  });

  it('asks a disjoint pair of condition-specific questions', () => {
    // The database CHECK constraint says the same thing. If these overlapped, one of the two
    // contexts would be writing a row the constraint refuses.
    expect(ADHERENCE_FIELDS_BY_CONTEXT.HYPERTENSION).toContain('tookToday');
    expect(ADHERENCE_FIELDS_BY_CONTEXT.HYPERTENSION).not.toContain('takingAsPrescribed');
    expect(ADHERENCE_FIELDS_BY_CONTEXT.DIABETES).toContain('takingAsPrescribed');
    expect(ADHERENCE_FIELDS_BY_CONTEXT.DIABETES).not.toContain('tookToday');
    expect(ADHERENCE_FIELDS_BY_CONTEXT.DIABETES).not.toContain('dosesMissed7d');
  });

  it('orders every asked question, so a failed save can focus one', () => {
    for (const fields of Object.values(ADHERENCE_FIELDS_BY_CONTEXT)) {
      for (const field of fields) {
        expect(ADHERENCE_FIELD_ORDER).toContain(field);
      }
    }
  });
});

describe('medication adherence barriers', () => {
  it('treats NONE as an exclusive answer', () => {
    expect(normalizeAdherenceProblems(['COST', 'NONE'])).toEqual(['NONE']);
  });

  it('keeps an empty list distinct from NONE', () => {
    // "Nobody asked" and "asked, and there are none" are different clinical statements.
    expect(normalizeAdherenceProblems([])).toEqual([]);
    expect(describeAdherence(emptyAdherenceEntry(RECORD_ID, REVISION_ID))).toBeNull();
    expect(
      describeAdherence({ ...emptyAdherenceEntry(RECORD_ID, REVISION_ID), problems: ['NONE'] }),
    ).toBe('no barriers reported');
  });

  it('de-duplicates and orders barriers by the vocabulary, not by entry order', () => {
    expect(normalizeAdherenceProblems(['COST', 'SIDE_EFFECTS', 'COST'])).toEqual([
      'SIDE_EFFECTS',
      'COST',
    ]);
  });

  it('refuses OTHER without a description', () => {
    const parsed = parseAdherenceEntries('HYPERTENSION', [entry({ problems: ['OTHER'] })]);
    expect(parsed.issues.map((issue) => issue.path)).toContain('entries[0].problemsOther');
  });

  it('drops the description when OTHER is unselected', () => {
    // Unticking the box is how a volunteer takes the answer back; keeping the text would leave a
    // barrier recorded that no longer appears anywhere in the UI.
    const parsed = parseAdherenceEntries('HYPERTENSION', [
      entry({ problems: ['COST'], problemsOther: 'Pharmacy is far' }),
    ]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.entries[0].problemsOther).toBeNull();
  });

  it('reports text beyond the column limit rather than truncating it', () => {
    const parsed = parseAdherenceEntries('HYPERTENSION', [
      entry({ problems: ['OTHER'], problemsOther: 'x'.repeat(201) }),
    ]);
    expect(parsed.issues.map((issue) => issue.code)).toContain('TOO_LONG');
  });
});

describe('parsing a whole adherence set', () => {
  it('reports a medication that appears twice instead of overwriting its twin', () => {
    // The unique key is (encounterId, context, medicationRecordId), so a duplicate is a
    // contradiction in the payload rather than a row that quietly wins.
    const parsed = parseAdherenceEntries('HYPERTENSION', [entry(), entry()]);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.issues.map((issue) => issue.path)).toContain('entries[1].medicationRecordId');
  });

  it('keeps distinct medications', () => {
    const parsed = parseAdherenceEntries('HYPERTENSION', [
      entry(),
      { ...entry(), medicationRecordId: OTHER_RECORD_ID },
    ]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.entries).toHaveLength(2);
  });

  it('rejects a key the contract does not declare', () => {
    const parsed = parseAdherenceEntries('HYPERTENSION', [
      { ...entry(), medicationName: 'Amlodipine' },
    ]);
    expect(parsed.issues.map((issue) => issue.code)).toContain('UNKNOWN_KEY');
  });

  it('rejects a value outside the vocabulary', () => {
    const parsed = parseAdherenceEntries('HYPERTENSION', [
      entry({ supplyRemaining: 'BOGUS' as never }),
    ]);
    expect(parsed.issues.map((issue) => issue.path)).toContain('entries[0].supplyRemaining');
  });

  it('rejects a malformed identifier rather than handing it to the database', () => {
    const parsed = parseAdherenceEntries('HYPERTENSION', [
      { ...entry(), observedRevisionId: 'not-a-uuid' },
    ]);
    expect(parsed.entries).toEqual([]);
    expect(parsed.issues.map((issue) => issue.path)).toContain('entries[0].observedRevisionId');
  });

  it('rejects an unknown context', () => {
    const parsed = parseAdherenceEntries('CHOLESTEROL', []);
    expect(parsed.issues.map((issue) => issue.path)).toContain('context');
  });

  it('applies the context rules to every parsed entry', () => {
    const parsed = parseAdherenceEntries('DIABETES', [entry({ tookToday: 'YES' })]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.entries[0].tookToday).toBe('NOT_ASSESSED');
  });

  it('reads a missing set as empty rather than failing the save', () => {
    expect(parseAdherenceEntries('HYPERTENSION', null).entries).toEqual([]);
    expect(parseAdherenceEntries('HYPERTENSION', null).issues).toEqual([]);
  });
});

describe('the note clause', () => {
  const answered: MedicationAdherenceEntry = {
    ...emptyAdherenceEntry(RECORD_ID, REVISION_ID),
    tookToday: 'YES',
    dosesMissed7d: 'ONE',
    supplyRemaining: 'LESS_THAN_ONE_WEEK',
    problems: ['COST'],
  };

  it('is byte-identical across calls', () => {
    // A signed note is hashed, so pressing the button twice has to produce the same text.
    expect(describeAdherence(answered)).toBe(describeAdherence(answered));
  });

  it('names every answered question in a fixed order', () => {
    expect(describeAdherence(answered)).toBe(
      'took it today; 1 dose missed in the past week; less than 1 week of supply remaining; barriers: cost',
    );
  });

  it('omits an unanswered question rather than stating a negative', () => {
    // A note must never report that a patient denied something nobody asked about.
    const clause = describeAdherence({
      ...emptyAdherenceEntry(RECORD_ID, REVISION_ID),
      supplyRemaining: 'NONE',
    });
    expect(clause).toBe('no supply remaining');
    expect(clause).not.toContain('today');
  });

  it('prefers the volunteer\'s own words for an "other" barrier', () => {
    expect(
      describeAdherence({
        ...emptyAdherenceEntry(RECORD_ID, REVISION_ID),
        problems: ['OTHER'],
        problemsOther: 'Shares tablets with a relative',
      }),
    ).toBe('barriers: Shares tablets with a relative');
  });
});

describe('answered tracking', () => {
  it('counts an untouched entry as unanswered', () => {
    expect(isAdherenceEntryAnswered(emptyAdherenceEntry(RECORD_ID, REVISION_ID))).toBe(false);
  });

  it('counts a recorded "none" barrier as answered', () => {
    expect(
      isAdherenceEntryAnswered({
        ...emptyAdherenceEntry(RECORD_ID, REVISION_ID),
        problems: ['NONE'],
      }),
    ).toBe(true);
  });
});
