import {
  planContacts,
  refillDueOn,
  supplyDays,
  type ContactPlanInput,
  type OpenContact,
} from './contact-schedule';

const TODAY = new Date('2026-11-18T10:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function input(overrides: Partial<ContactPlanInput> = {}): ContactPlanInput {
  return {
    tier: 'HIGH',
    atTarget: false,
    actions: [],
    changed: true,
    becameUrgent: false,
    today: TODAY,
    latestEncounter: { id: 'enc-1', at: new Date('2026-11-18T09:00:00Z') },
    lastTeleAt: null,
    carePlanFollowUpDate: null,
    stopped: false,
    open: [],
    ...overrides,
  };
}

const open = (overrides: Partial<OpenContact>): OpenContact => ({
  id: 'c1',
  mode: 'IN_PERSON',
  purpose: 'ROUTINE',
  dueOn: day('2027-01-18'),
  status: 'DUE',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  ...overrides,
});

describe('planContacts (#338)', () => {
  it('a new High patient: in person within 2 months, a phone call in the month between', () => {
    const plan = planContacts(input());
    expect(plan.create).toEqual([
      { mode: 'IN_PERSON', purpose: 'ROUTINE', dueOn: day('2027-01-18') },
      { mode: 'PHONE', purpose: 'ROUTINE', dueOn: day('2026-12-18') },
    ]);
  });

  it('an Urgent patient: one confirmation call within 48 hours, and no routine visit', () => {
    const plan = planContacts(input({ tier: 'URGENT', becameUrgent: true }));
    expect(plan.create).toEqual([
      { mode: 'PHONE', purpose: 'URGENT_CONFIRMATION', dueOn: day('2026-11-20') },
    ]);
    // Still Urgent on the next recompute: no second call.
    expect(planContacts(input({ tier: 'URGENT', becameUrgent: false })).create).toEqual([]);
  });

  it.each([
    ['MODERATE', 'REMINDER_BEFORE_VISIT'],
    ['LOW_MODERATE', 'REMINDER_BEFORE_VISIT'],
    ['STABLE', 'ROUTINE'],
  ] as const)('%s: a visit and a %s call', (tier, telePurpose) => {
    const plan = planContacts(input({ tier }));
    expect(plan.create.map((c) => [c.mode, c.purpose])).toEqual([
      ['IN_PERSON', 'ROUTINE'],
      ['PHONE', telePurpose],
    ]);
  });

  it('LOW: the in-person contact is a rescreen', () => {
    expect(planContacts(input({ tier: 'LOW' })).create[0].purpose).toBe('RESCREEN');
  });

  it('a raised reading to confirm pulls the visit in as CONFIRM_READING', () => {
    const plan = planContacts(input({ tier: 'MODERATE', actions: ['CONFIRM_ON_ANOTHER_DAY'] }));
    expect(plan.create[0]).toEqual({
      mode: 'IN_PERSON',
      purpose: 'CONFIRM_READING',
      dueOn: day('2026-12-02'),
    });
  });

  it("a clinician's hand-picked date wins when it is sooner, and only then", () => {
    const sooner = planContacts(input({ carePlanFollowUpDate: day('2026-12-01') }));
    expect(sooner.create[0].dueOn).toEqual(day('2026-12-01'));
    const later = planContacts(input({ carePlanFollowUpDate: day('2027-06-01') }));
    expect(later.create[0].dueOn).toEqual(day('2027-01-18'));
  });

  it('never seen in person: due today, never in the past', () => {
    const plan = planContacts(input({ latestEncounter: null }));
    expect(plan.create[0].dueOn).toEqual(day('2026-11-18'));
  });

  it('a raised reading with no diagnosis yet: one visit to confirm it, after the interval', () => {
    const plan = planContacts(input({ tier: 'NOT_TIERED', actions: ['CONFIRM_ON_ANOTHER_DAY'] }));
    expect(plan.create).toEqual([
      { mode: 'IN_PERSON', purpose: 'CONFIRM_READING', dueOn: day('2026-12-02') },
    ]);
  });

  it('NOT_TIERED with nothing to confirm, or stopped (died, moved, opted out): nothing new', () => {
    expect(planContacts(input({ tier: 'NOT_TIERED' })).create).toEqual([]);
    expect(planContacts(input({ stopped: true })).create).toEqual([]);
  });

  describe('refill calls', () => {
    it('books one call by the refill date, whatever the tier', () => {
      const plan = planContacts(input({ tier: 'URGENT', refillDueOn: day('2026-11-25') }));
      expect(plan.create).toEqual([
        { mode: 'PHONE', purpose: 'ADHERENCE_REFILL', dueOn: day('2026-11-25') },
      ]);
    });

    it('brings an open refill call forward, never back', () => {
      const refill = open({
        id: 'r',
        mode: 'PHONE',
        purpose: 'ADHERENCE_REFILL',
        dueOn: day('2026-12-01'),
      });
      const sooner = planContacts(
        input({ changed: false, open: [refill], refillDueOn: day('2026-11-20') }),
      );
      expect(sooner.reschedule).toEqual([
        { contactId: 'r', purpose: 'ADHERENCE_REFILL', dueOn: day('2026-11-20') },
      ]);
      expect(sooner.create.filter((c) => c.purpose === 'ADHERENCE_REFILL')).toEqual([]);
      const later = planContacts(
        input({ changed: false, open: [refill], refillDueOn: day('2026-12-20') }),
      );
      expect(later.reschedule).toEqual([]);
    });

    it('a refill call is not the routine call, so both are booked', () => {
      const plan = planContacts(input({ refillDueOn: day('2026-11-25') }));
      expect(plan.create.map((c) => c.purpose).sort()).toEqual([
        'ADHERENCE_REFILL',
        'ROUTINE',
        'ROUTINE',
      ]);
    });

    it('a stopped patient gets no refill call either', () => {
      expect(planContacts(input({ stopped: true, refillDueOn: day('2026-11-25') })).create).toEqual(
        [],
      );
    });
  });

  describe('existing contacts', () => {
    it('creates only what is missing, so a nightly run is quiet', () => {
      const plan = planContacts(
        input({
          changed: false,
          open: [
            open({ id: 'v', dueOn: day('2027-01-18') }),
            open({ id: 't', mode: 'PHONE', dueOn: day('2026-12-18') }),
          ],
        }),
      );
      expect(plan).toEqual({ completeByEncounter: [], markMissed: [], create: [], reschedule: [] });
    });

    it('moves a routine date only when the answer changed', () => {
      const existing = [open({ id: 'v', dueOn: day('2027-02-18') })];
      expect(planContacts(input({ changed: false, open: existing })).reschedule).toEqual([]);
      expect(planContacts(input({ changed: true, open: existing })).reschedule).toEqual([
        { contactId: 'v', purpose: 'ROUTINE', dueOn: day('2027-01-18') },
      ]);
    });

    it('a visit on or near the due date completes the in-person contact', () => {
      const near = open({ id: 'v', dueOn: day('2026-11-22') });
      expect(planContacts(input({ open: [near] })).completeByEncounter).toEqual([
        { contactId: 'v', encounterId: 'enc-1' },
      ]);
      // Weeks early does not count, nor does the visit that scheduled it.
      const far = open({ id: 'v', dueOn: day('2027-01-18') });
      expect(planContacts(input({ open: [far] })).completeByEncounter).toEqual([]);
      const scheduledByIt = open({ id: 'v', dueOn: day('2026-11-18'), createdAt: TODAY });
      expect(planContacts(input({ open: [scheduledByIt] })).completeByEncounter).toEqual([]);
    });

    it('a missed contact is completed by a later visit, as returned', () => {
      const missed = open({ id: 'm', dueOn: day('2026-10-01'), status: 'MISSED' });
      expect(planContacts(input({ open: [missed] })).completeByEncounter).toEqual([
        { contactId: 'm', encounterId: 'enc-1' },
      ]);
    });

    it('marks a contact missed after the grace period, not before, and books the next', () => {
      const stale = open({ id: 'p', mode: 'PHONE', dueOn: day('2026-11-10') });
      const fresh = open({ id: 'p', mode: 'PHONE', dueOn: day('2026-11-12') });
      const plan = planContacts(input({ latestEncounter: null, open: [stale] }));
      expect(plan.markMissed).toEqual(['p']);
      expect(plan.create.map((c) => c.mode)).toContain('PHONE');
      expect(planContacts(input({ latestEncounter: null, open: [fresh] })).markMissed).toEqual([]);
    });
  });
});

describe('supplyDays (#338)', () => {
  it.each([
    ['30', 30],
    ['30 days', 30],
    ['14d', 14],
    ['4 weeks', 28],
    ['1 month', 30],
    ['3 Months', 90],
    ['ongoing', null],
    ['', null],
    [null, null],
    ['0', null],
  ] as const)('%p is %p days', (text, days) => {
    expect(supplyDays(text)).toBe(days);
  });
});

describe('refillDueOn (#338)', () => {
  const base = {
    prescriptions: [],
    supply: null,
    lastRefillBookedAt: null,
    today: TODAY,
  };

  it('five days before a 30-day prescription runs out', () => {
    expect(
      refillDueOn({
        ...base,
        prescriptions: [{ createdAt: new Date('2026-11-10T09:00:00Z'), duration: '30 days' }],
      }),
    ).toEqual(day('2026-12-05'));
  });

  it('skips prescriptions with no length, and ones that ran out long ago', () => {
    expect(
      refillDueOn({
        ...base,
        prescriptions: [{ createdAt: day('2026-11-10'), duration: 'ongoing' }],
      }),
    ).toBeNull();
    expect(
      refillDueOn({ ...base, prescriptions: [{ createdAt: day('2026-01-01'), duration: '30' }] }),
    ).toBeNull();
  });

  it('a visit that found them out of medicine wants a call today; low supply in two days', () => {
    expect(refillDueOn({ ...base, supply: { at: day('2026-11-17'), remaining: 'NONE' } })).toEqual(
      day('2026-11-18'),
    );
    expect(
      refillDueOn({ ...base, supply: { at: day('2026-11-17'), remaining: 'LESS_THAN_ONE_WEEK' } }),
    ).toEqual(day('2026-11-19'));
    expect(
      refillDueOn({ ...base, supply: { at: day('2026-11-17'), remaining: 'AT_LEAST_ONE_WEEK' } }),
    ).toBeNull();
  });

  it('books once per piece of news', () => {
    const facts = {
      ...base,
      prescriptions: [{ createdAt: day('2026-11-10'), duration: '30' }],
      lastRefillBookedAt: new Date('2026-11-11T00:00:00Z'),
    };
    expect(refillDueOn(facts)).toBeNull();
    expect(
      refillDueOn({ ...facts, prescriptions: [{ createdAt: day('2026-11-15'), duration: '30' }] }),
    ).toEqual(day('2026-12-10'));
  });
});
