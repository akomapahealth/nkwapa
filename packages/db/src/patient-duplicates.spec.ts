import {
  DUPLICATE_CONFIDENCE_THRESHOLDS,
  DUPLICATE_MATCH_REASONS,
  DUPLICATE_MATCH_REASON_LABELS,
  DUPLICATE_MATCH_WEIGHTS,
  duplicatePairKey,
  editDistanceWithin,
  evaluateDuplicatePair,
  normalizeEmailForMatch,
  normalizeNameForMatch,
  parseDuplicatePairKey,
  sameCalendarDay,
  scoreToConfidence,
  type DuplicateCandidateInput,
} from './patient-duplicates';

function patient(overrides: Partial<DuplicateCandidateInput> = {}): DuplicateCandidateInput {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    firstName: 'Ama',
    lastName: 'Mensah',
    dob: new Date('1990-05-15T00:00:00.000Z'),
    phoneE164: null,
    email: null,
    nationalIdHash: null,
    nationalIdType: null,
    nationalIdLast4: null,
    ...overrides,
  };
}

describe('normalizeNameForMatch', () => {
  it('folds case, accents, and punctuation so the same name matches itself', () => {
    expect(normalizeNameForMatch('Kwabena')).toBe('kwabena');
    expect(normalizeNameForMatch('Adjoa-Serwaa')).toBe(normalizeNameForMatch('adjoa serwaa'));
    expect(normalizeNameForMatch('Amoafoa')).toBe(normalizeNameForMatch('Amoafoá'));
    expect(normalizeNameForMatch("O'Brien")).toBe('obrien');
  });

  it('returns an empty string for nothing, which never matches', () => {
    expect(normalizeNameForMatch(null)).toBe('');
    expect(normalizeNameForMatch(undefined)).toBe('');
    expect(normalizeNameForMatch('   ')).toBe('');
  });
});

describe('normalizeEmailForMatch', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailForMatch('  Ama.Mensah@Nkwapa.Local ')).toBe('ama.mensah@nkwapa.local');
  });

  it('maps nothing to an empty string', () => {
    expect(normalizeEmailForMatch(null)).toBe('');
    expect(normalizeEmailForMatch(undefined)).toBe('');
  });
});

describe('sameCalendarDay', () => {
  it('ignores the time of day, because dob is a timestamp holding a date', () => {
    expect(sameCalendarDay('1990-05-15T00:00:00.000Z', '1990-05-15T11:30:00.000Z')).toBe(true);
  });

  it('separates neighbouring days', () => {
    expect(sameCalendarDay('1990-05-15T00:00:00.000Z', '1990-05-16T00:00:00.000Z')).toBe(false);
  });

  it('never matches when either side is missing or unparseable', () => {
    expect(sameCalendarDay(null, null)).toBe(false);
    expect(sameCalendarDay('1990-05-15T00:00:00.000Z', null)).toBe(false);
    expect(sameCalendarDay('not a date', 'not a date')).toBe(false);
  });
});

describe('editDistanceWithin', () => {
  it('accepts identical and near-identical strings', () => {
    expect(editDistanceWithin('kwabena', 'kwabena', 2)).toBe(true);
    expect(editDistanceWithin('kwabena', 'kwabina', 2)).toBe(true);
    expect(editDistanceWithin('ama', 'amaa', 2)).toBe(true);
  });

  it('rejects strings further apart than the bound', () => {
    expect(editDistanceWithin('kwabena', 'yaa', 2)).toBe(false);
    expect(editDistanceWithin('ama', 'akosua', 2)).toBe(false);
  });

  it('handles an empty side against the bound', () => {
    expect(editDistanceWithin('', 'ab', 2)).toBe(true);
    expect(editDistanceWithin('', 'abc', 2)).toBe(false);
  });
});

describe('duplicatePairKey', () => {
  it('is independent of the order the pair arrives in', () => {
    expect(duplicatePairKey('b', 'a')).toBe(duplicatePairKey('a', 'b'));
    expect(duplicatePairKey('a', 'b')).toBe('a:b');
  });

  it('round-trips through parseDuplicatePairKey', () => {
    expect(parseDuplicatePairKey(duplicatePairKey('b', 'a'))).toEqual(['a', 'b']);
  });

  it('refuses a malformed key rather than guessing', () => {
    expect(parseDuplicatePairKey('a')).toBeNull();
    expect(parseDuplicatePairKey('a:b:c')).toBeNull();
    expect(parseDuplicatePairKey(':b')).toBeNull();
  });
});

describe('scoreToConfidence', () => {
  it('bands on the documented thresholds', () => {
    expect(scoreToConfidence(DUPLICATE_CONFIDENCE_THRESHOLDS.HIGH)).toBe('HIGH');
    expect(scoreToConfidence(DUPLICATE_CONFIDENCE_THRESHOLDS.HIGH - 1)).toBe('MEDIUM');
    expect(scoreToConfidence(DUPLICATE_CONFIDENCE_THRESHOLDS.MEDIUM)).toBe('MEDIUM');
    expect(scoreToConfidence(DUPLICATE_CONFIDENCE_THRESHOLDS.MEDIUM - 1)).toBe('LOW');
    expect(scoreToConfidence(0)).toBe('LOW');
  });
});

describe('evaluateDuplicatePair', () => {
  it('reports nothing for two unrelated charts', () => {
    const result = evaluateDuplicatePair(
      patient(),
      patient({ id: 'other', firstName: 'Kofi', lastName: 'Boateng', dob: '1975-01-02' }),
    );

    expect(result.reasons).toEqual([]);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('LOW');
  });

  it('flags an exact national ID hash collision at full confidence', () => {
    const result = evaluateDuplicatePair(
      patient({ nationalIdHash: 'abc' }),
      patient({ id: 'other', firstName: 'Kofi', lastName: 'Boateng', nationalIdHash: 'abc' }),
    );

    expect(result.reasons).toContain('NATIONAL_ID_HASH');
    expect(result.confidence).toBe('HIGH');
  });

  it('flags the same name and date of birth', () => {
    const result = evaluateDuplicatePair(patient(), patient({ id: 'other' }));

    expect(result.reasons).toEqual(['NAME_AND_DOB']);
    expect(result.score).toBe(DUPLICATE_MATCH_WEIGHTS.NAME_AND_DOB);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('requires the date of birth to agree before matching on name', () => {
    const result = evaluateDuplicatePair(patient(), patient({ id: 'other', dob: '1991-05-15' }));

    expect(result.reasons).toEqual([]);
  });

  it('does not treat two missing dates of birth as a match', () => {
    const result = evaluateDuplicatePair(
      patient({ dob: null }),
      patient({ id: 'other', dob: null }),
    );

    expect(result.reasons).toEqual([]);
  });

  it('matches a shared phone number on its own but keeps it below MEDIUM', () => {
    const result = evaluateDuplicatePair(
      patient({ phoneE164: '+233201234567' }),
      patient({
        id: 'other',
        firstName: 'Kofi',
        lastName: 'Boateng',
        dob: '1975-01-02',
        phoneE164: '+233201234567',
      }),
    );

    expect(result.reasons).toEqual(['PHONE']);
    expect(result.confidence).toBe('LOW');
  });

  it('matches a shared email case-insensitively', () => {
    const result = evaluateDuplicatePair(
      patient({ email: 'Ama@Nkwapa.local' }),
      patient({
        id: 'other',
        firstName: 'Kofi',
        lastName: 'Boateng',
        dob: '1975-01-02',
        email: 'ama@nkwapa.local',
      }),
    );

    expect(result.reasons).toEqual(['EMAIL']);
  });

  it('never matches on a blank phone or email', () => {
    const result = evaluateDuplicatePair(
      patient({ phoneE164: null, email: '', dob: null, firstName: 'Ama', lastName: 'Mensah' }),
      patient({
        id: 'other',
        phoneE164: null,
        email: '',
        dob: null,
        firstName: 'Kofi',
        lastName: 'Boateng',
      }),
    );

    expect(result.reasons).toEqual([]);
  });

  it('requires ID type, last four, and date of birth together for the partial ID rule', () => {
    const base = { nationalIdType: 'NATIONAL_ID', nationalIdLast4: '6789' };

    expect(
      evaluateDuplicatePair(
        patient({ ...base, firstName: 'Ama' }),
        patient({ id: 'other', ...base, firstName: 'Akosua' }),
      ).reasons,
    ).toContain('NATIONAL_ID_LAST4');

    expect(
      evaluateDuplicatePair(
        patient({ ...base, firstName: 'Ama' }),
        patient({ id: 'other', ...base, nationalIdType: 'PASSPORT', firstName: 'Akosua' }),
      ).reasons,
    ).not.toContain('NATIONAL_ID_LAST4');

    expect(
      evaluateDuplicatePair(
        patient({ ...base, firstName: 'Ama' }),
        patient({ id: 'other', ...base, dob: '1991-05-15', firstName: 'Akosua' }),
      ).reasons,
    ).not.toContain('NATIONAL_ID_LAST4');
  });

  it('treats a near-miss first name as a supporting signal only', () => {
    const result = evaluateDuplicatePair(
      patient({ firstName: 'Kwabena', lastName: 'Owusu' }),
      patient({ id: 'other', firstName: 'Kwabina', lastName: 'Owusu' }),
    );

    expect(result.reasons).toEqual(['NAME_SIMILAR_AND_DOB']);
    expect(result.confidence).toBe('LOW');
  });

  it('does not double-count an exact name as also being a similar one', () => {
    const result = evaluateDuplicatePair(patient(), patient({ id: 'other' }));

    expect(result.reasons).not.toContain('NAME_SIMILAR_AND_DOB');
  });

  it('lifts a similar name to MEDIUM once a contact detail agrees too', () => {
    const result = evaluateDuplicatePair(
      patient({ firstName: 'Kwabena', lastName: 'Owusu', phoneE164: '+233201234567' }),
      patient({
        id: 'other',
        firstName: 'Kwabina',
        lastName: 'Owusu',
        phoneE164: '+233201234567',
      }),
    );

    expect(result.reasons).toEqual(['PHONE', 'NAME_SIMILAR_AND_DOB']);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('caps the score at 100 when many rules fire at once', () => {
    const shared = {
      nationalIdHash: 'abc',
      nationalIdType: 'NATIONAL_ID',
      nationalIdLast4: '6789',
      phoneE164: '+233201234567',
      email: 'ama@nkwapa.local',
    };
    const result = evaluateDuplicatePair(patient(shared), patient({ id: 'other', ...shared }));

    expect(result.score).toBe(100);
    expect(result.confidence).toBe('HIGH');
  });

  it('is symmetric', () => {
    const left = patient({ phoneE164: '+233201234567', email: 'ama@nkwapa.local' });
    const right = patient({ id: 'other', firstName: 'Amaa', phoneE164: '+233201234567' });

    expect(evaluateDuplicatePair(left, right)).toEqual(evaluateDuplicatePair(right, left));
  });
});

describe('reason metadata', () => {
  it('gives every rule a weight and a plain-language label', () => {
    for (const reason of DUPLICATE_MATCH_REASONS) {
      expect(DUPLICATE_MATCH_WEIGHTS[reason]).toBeGreaterThan(0);
      expect(DUPLICATE_MATCH_REASON_LABELS[reason]).toMatch(/[a-z]/);
      expect(DUPLICATE_MATCH_REASON_LABELS[reason]).not.toMatch(/_/);
    }
  });
});
