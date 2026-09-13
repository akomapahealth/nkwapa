import {
  formatBloodPressure,
  formatPulse,
  freshestVitals,
  hasBloodPressure,
  type EncounterVitalsReading,
} from './encounter-vitals';

function reading(overrides: Partial<EncounterVitalsReading> = {}): EncounterVitalsReading {
  return {
    systolicBp: 132,
    diastolicBp: 84,
    pulseBpm: 76,
    weightKg: null,
    heightCm: null,
    bmi: null,
    ...overrides,
  };
}

describe('freshestVitals', () => {
  /*
    The encounter page awaits the outgoing tab's save but not the refetch that follows, so a
    volunteer who edits vitals and immediately switches to Hypertension can arrive before the prop
    has caught up. Comparing updatedAt is what stops the interview classifying a stale reading.
  */
  it('prefers the local record when it was written more recently', () => {
    const page = reading({ systolicBp: 132, updatedAt: '2026-09-13T12:00:00.000Z' });
    const cache = reading({ systolicBp: 158, updatedAt: '2026-09-13T12:05:00.000Z' });
    expect(freshestVitals(page, cache)?.systolicBp).toBe(158);
  });

  it('prefers the page prop when it is the newer of the two', () => {
    const page = reading({ systolicBp: 158, updatedAt: '2026-09-13T12:05:00.000Z' });
    const cache = reading({ systolicBp: 132, updatedAt: '2026-09-13T12:00:00.000Z' });
    expect(freshestVitals(page, cache)?.systolicBp).toBe(158);
  });

  it('keeps the incumbent when the timestamps match', () => {
    const at = '2026-09-13T12:00:00.000Z';
    const page = reading({ systolicBp: 132, updatedAt: at });
    const cache = reading({ systolicBp: 158, updatedAt: at });
    expect(freshestVitals(page, cache)?.systolicBp).toBe(132);
  });

  it('falls back to whichever source exists', () => {
    expect(freshestVitals(null, reading())?.systolicBp).toBe(132);
    expect(freshestVitals(reading(), null)?.systolicBp).toBe(132);
    expect(freshestVitals(null, null)).toBeNull();
  });

  /*
    A record with no timestamp cannot displace one that has a real timestamp; treating an absent
    stamp as newest would let an old cached row win every comparison.
  */
  it('does not let a record with no timestamp displace a stamped one', () => {
    const page = reading({ systolicBp: 132, updatedAt: '2026-09-13T12:00:00.000Z' });
    const cache = reading({ systolicBp: 158 });
    expect(freshestVitals(page, cache)?.systolicBp).toBe(132);
  });

  it('uses a stamped record over an unstamped one', () => {
    const page = reading({ systolicBp: 132 });
    const cache = reading({ systolicBp: 158, updatedAt: '2026-09-13T12:00:00.000Z' });
    expect(freshestVitals(page, cache)?.systolicBp).toBe(158);
  });

  it('ignores an unparseable timestamp rather than trusting it', () => {
    const page = reading({ systolicBp: 132, updatedAt: '2026-09-13T12:00:00.000Z' });
    const cache = reading({ systolicBp: 158, updatedAt: 'yesterday-ish' });
    expect(freshestVitals(page, cache)?.systolicBp).toBe(132);
  });
});

describe('hasBloodPressure', () => {
  /* Half a reading is not a reading: the classification needs both values. */
  it('requires both halves', () => {
    expect(hasBloodPressure(reading())).toBe(true);
    expect(hasBloodPressure(reading({ diastolicBp: null }))).toBe(false);
    expect(hasBloodPressure(reading({ systolicBp: null }))).toBe(false);
    expect(hasBloodPressure(null)).toBe(false);
  });
});

describe('display', () => {
  it('renders a reading with its unit', () => {
    expect(formatBloodPressure(reading())).toBe('132/84 mmHg');
    expect(formatPulse(reading())).toBe('76 bpm');
  });

  /*
    "Not recorded" rather than a blank or a dash.

    An empty cell reads as a rendering failure; the interview needs to say plainly that nobody has
    measured this yet, because the volunteer's next action is to go and do it.
  */
  it('says plainly when nothing was measured', () => {
    expect(formatBloodPressure(null)).toBe('Not recorded');
    expect(formatBloodPressure(reading({ systolicBp: null }))).toBe('Not recorded');
    expect(formatPulse(reading({ pulseBpm: null }))).toBe('Not recorded');
  });
});
