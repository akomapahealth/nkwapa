import {
  daySummaryHref,
  describePerformerCorrection,
  describePracticeClear,
  practiceCountValue,
  practiceIsClear,
  assignableStaff,
  canCorrectPerformer,
  describeRouteStop,
  formatMinutes,
  heldTooLongMinutes,
  isStationBoard,
  moveStation,
  minutesSince,
  ageInYears,
  performerLabel,
  screenerFromName,
  screenersByUser,
  stationsPassedOver,
  suggestedNextStation,
  withScreener,
  sortReviewQueue,
  type ClinicStation,
  type StationVisit,
  type OnShiftStaff,
} from './stations';

const stations: ClinicStation[] = [
  { id: 'intake', kind: 'INTAKE', name: 'Intake', sortOrder: 1, active: true },
  { id: 'bp', kind: 'BLOOD_PRESSURE', name: 'BP', sortOrder: 2, active: true },
  { id: 'glucose', kind: 'GLUCOSE', name: 'Glucose', sortOrder: 3, active: true },
  { id: 'anthro', kind: 'ANTHROPOMETRY', name: 'Anthropometry', sortOrder: 4, active: true },
  { id: 'review', kind: 'REVIEW', name: 'Review', sortOrder: 5, active: true },
];

describe('station hand-off helpers', () => {
  it('suggests the next station in order and nothing after review', () => {
    expect(suggestedNextStation(stations, 'bp')?.id).toBe('glucose');
    expect(suggestedNextStation(stations, 'review')).toBeNull();
  });

  it('passes over closed stations', () => {
    const glucoseClosed = stations.map((s) => (s.id === 'glucose' ? { ...s, active: false } : s));
    expect(suggestedNextStation(glucoseClosed, 'bp')?.id).toBe('anthro');
  });

  it('lists the stations a jump forward skips, never the review station', () => {
    expect(stationsPassedOver(stations, 'intake', 'anthro').map((s) => s.id)).toEqual([
      'bp',
      'glucose',
    ]);
    expect(stationsPassedOver(stations, 'bp', 'review').map((s) => s.id)).toEqual([
      'glucose',
      'anthro',
    ]);
  });

  it('skips nothing when sending a patient back to an earlier station', () => {
    expect(stationsPassedOver(stations, 'anthro', 'bp')).toEqual([]);
  });

  it('counts whole minutes waited', () => {
    const now = new Date('2026-10-07T10:30:00Z');
    expect(minutesSince('2026-10-07T10:17:40Z', now)).toBe(12);
    expect(minutesSince('2026-10-07T10:31:00Z', now)).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('reads minutes, then hours and minutes, and marks nothing measured', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(65)).toBe('1 h 05 min');
    expect(formatMinutes(null)).toBe('–');
  });
});

describe('moveStation (#32)', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('swaps a station with its neighbour', () => {
    expect(moveStation(order, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveStation(order, 'b', 1)).toEqual(['a', 'c', 'b']);
  });
  it('leaves the order alone at either end', () => {
    expect(moveStation(order, 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveStation(order, 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('assignableStaff', () => {
  const member = (
    id: string,
    stationId: string | null,
    activeVisitCount: number,
  ): OnShiftStaff => ({
    user: { id, displayName: id },
    roleAtShift: 'VOLUNTEER',
    stationId,
    activeVisitCount,
  });

  it('puts the people at the station first, least busy first, and everyone else after', () => {
    const { atStation, elsewhere } = assignableStaff(
      [
        member('Kofi', 'bp', 1),
        member('Esi', 'glucose', 0),
        member('Ama', 'bp', 0),
        member('Yaw', null, 2),
      ],
      'bp',
    );
    expect(atStation.map((m) => m.user.id)).toEqual(['Ama', 'Kofi']);
    expect(elsewhere.map((m) => m.user.id)).toEqual(['Esi', 'Yaw']);
  });

  it('offers nobody when nobody is on shift', () => {
    expect(assignableStaff([], 'bp')).toEqual({ atStation: [], elsewhere: [] });
  });
});

describe('isStationBoard (#197)', () => {
  const board = { date: '2026-03-21', timezone: 'Africa/Accra', stations: [] };

  it('accepts a board', () => {
    expect(isStationBoard(board)).toBe(true);
  });

  it("rejects the stations page's board-plus-shifts and anything else", () => {
    expect(isStationBoard({ board, shifts: { items: [] } })).toBe(false);
    expect(isStationBoard(null)).toBe(false);
    expect(isStationBoard([])).toBe(false);
    expect(isStationBoard({ timezone: 'Africa/Accra' })).toBe(false);
  });
});

describe('who actually screened (#227)', () => {
  it('names both people only when they differ', () => {
    expect(withScreener('Kofi', 'Ama')).toBe('Kofi (Ama screening)');
    expect(withScreener('Kofi', null)).toBe('Kofi');
    expect(performerLabel('Kofi', 'Ama')).toBe('Ama · signed in as Kofi');
    expect(performerLabel('Kofi', undefined)).toBe('Kofi');
  });

  it('sends the account holder when nobody else is named', () => {
    expect(screenerFromName(null)).toEqual({ isAccountHolder: true });
    expect(screenerFromName('Ama')).toEqual({ isAccountHolder: false, name: 'Ama' });
  });

  it('reads each account’s live screener, tolerating boards saved before it', () => {
    const map = screenersByUser([
      {
        user: { id: 'kofi', displayName: 'Kofi' },
        roleAtShift: 'VOLUNTEER',
        stationId: null,
        activeVisitCount: 0,
        screenerName: 'Ama',
      },
      {
        user: { id: 'esi', displayName: 'Esi' },
        roleAtShift: 'VOLUNTEER',
        stationId: null,
        activeVisitCount: 0,
      },
    ]);
    expect(map.get('kofi')).toBe('Ama');
    expect(map.get('esi')).toBeNull();
    expect(screenersByUser(undefined).size).toBe(0);
  });
});

describe('canCorrectPerformer (#227)', () => {
  const done = {
    status: 'COMPLETED' as const,
    completedBy: { id: 'kofi', displayName: 'Kofi' },
    checkInStatus: 'IN_PROGRESS',
  };
  const kofi = { userId: 'kofi', canManage: false };

  it('offers the completing account a fix until the session is done', () => {
    expect(canCorrectPerformer(done, kofi)).toBe(true);
    expect(canCorrectPerformer({ ...done, status: 'SKIPPED' }, kofi)).toBe(true);
    expect(canCorrectPerformer({ ...done, checkInStatus: 'COMPLETED' }, kofi)).toBe(false);
  });

  it('offers a manager a fix at any time, and nobody one for an unfinished stop', () => {
    const manager = { userId: 'mgr', canManage: true };
    expect(canCorrectPerformer({ ...done, checkInStatus: 'COMPLETED' }, manager)).toBe(true);
    expect(canCorrectPerformer(done, { userId: 'esi', canManage: false })).toBe(false);
    expect(canCorrectPerformer({ ...done, status: 'IN_PROGRESS' }, manager)).toBe(false);
  });
});

describe('describeRouteStop', () => {
  const at = (iso: string) => `at ${iso}`;
  const base = {
    completedBy: { id: 'u1', displayName: 'Kofi Boateng' },
    completedAt: '2026-11-03T10:04:00Z',
    performedByName: null,
    endReason: null,
  };

  it('strikes a cancelled stop and keeps who, when and why', () => {
    expect(
      describeRouteStop({ ...base, status: 'CANCELLED', endReason: 'Patient left' }, at),
    ).toEqual({
      struck: true,
      summary: 'Cancelled by Kofi Boateng, at 2026-11-03T10:04:00Z',
      reason: 'Reason: Patient left',
    });
  });

  it('names the screener on a completed stop and gives no reason line', () => {
    expect(describeRouteStop({ ...base, status: 'COMPLETED', performedByName: 'Ama' }, at)).toEqual(
      {
        struck: false,
        summary: 'Completed by Ama · signed in as Kofi Boateng, at 2026-11-03T10:04:00Z',
        reason: null,
      },
    );
  });

  it('says a queued stop is queued, without inventing who or when', () => {
    expect(
      describeRouteStop({ ...base, completedBy: null, completedAt: null, status: 'QUEUED' }, at),
    ).toEqual({ struck: false, summary: 'Queued', reason: null });
  });
});

describe('describePerformerCorrection (#307)', () => {
  const at = '2026-11-05T10:04:00.000Z';
  const correction = {
    previousPerformer: 'Kofi Boateng',
    correctedAt: at,
    correctedBy: { id: 'u1', displayName: 'Ama Mensah' },
    reason: 'Ama screened, on Kofi’s login',
  };

  it('keeps the earlier name and says who corrected it, when and why', () => {
    expect(describePerformerCorrection(correction, (iso) => iso.slice(11, 16))).toEqual({
      previous: 'Kofi Boateng',
      summary: 'Corrected by Ama Mensah, 10:04',
      reason: 'Reason: Ama screened, on Kofi’s login',
    });
  });

  it('leaves the reason out when none was given', () => {
    expect(
      describePerformerCorrection({ ...correction, reason: null }, () => 'then').reason,
    ).toBeNull();
  });
});

describe('ageInYears', () => {
  const now = new Date('2026-11-11T10:40:00Z');
  it('counts whole years, before and on the birthday', () => {
    expect(ageInYears('1980-11-12', now)).toBe(45);
    expect(ageInYears('1980-11-11', now)).toBe(46);
    expect(ageInYears('1980-11-11T00:00:00.000Z', now)).toBe(46);
  });
  it('is null without a usable date', () => {
    expect(ageInYears(null, now)).toBeNull();
    expect(ageInYears('unknown', now)).toBeNull();
  });
});

describe('heldTooLongMinutes (#424)', () => {
  const now = new Date('2026-11-24T10:30:00Z');
  const held = (kind: ClinicStation['kind'], minutesAgo: number) => ({
    status: 'IN_PROGRESS' as const,
    claimedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    station: { id: kind, kind, name: kind, sortOrder: 1 },
  });

  it('flags a measurement station past 15 minutes and review past 30', () => {
    expect(heldTooLongMinutes(held('BLOOD_PRESSURE', 16), now)).toBe(16);
    expect(heldTooLongMinutes(held('BLOOD_PRESSURE', 15), now)).toBeNull();
    expect(heldTooLongMinutes(held('REVIEW', 25), now)).toBeNull();
    expect(heldTooLongMinutes(held('REVIEW', 31), now)).toBe(31);
  });

  it('counts from when the patient was taken, and never flags a waiting patient', () => {
    expect(heldTooLongMinutes({ ...held('GLUCOSE', 40), status: 'QUEUED' }, now)).toBeNull();
    expect(heldTooLongMinutes({ ...held('GLUCOSE', 40), claimedAt: null }, now)).toBeNull();
  });
});

describe('sortReviewQueue (#419)', () => {
  const at = (minute: number) => `2026-11-24T09:${String(minute).padStart(2, '0')}:00.000Z`;
  const flag = (kind: 'REFER_TODAY' | 'REPEAT_AT_REVIEW') =>
    ({ kind, source: 'BP', systolic: 180, diastolic: 110, stationName: 'BP', at: at(0) }) as never;
  const visit = (id: string, minute: number, extra: Partial<StationVisit> = {}) =>
    ({ id, queuedAt: at(minute), lineFlags: [], doctorRequest: null, ...extra }) as StationVisit;
  const request = (urgency: 'NOW' | 'BEFORE_LEAVING', open = true) =>
    ({ id: 'r', urgency, open }) as StationVisit['doctorRequest'];
  const ids = (visits: StationVisit[]) => sortReviewQueue(visits).map((v) => v.id);

  it('puts a doctor asked for now, then refer today, then repeat at review, then the rest', () => {
    expect(
      ids([
        visit('plain', 1),
        visit('repeat', 2, { lineFlags: [flag('REPEAT_AT_REVIEW')] }),
        visit('refer', 3, { lineFlags: [flag('REFER_TODAY')] }),
        visit('now', 4, { doctorRequest: request('NOW') }),
      ]),
    ).toEqual(['now', 'refer', 'repeat', 'plain']);
  });

  it('is oldest first within a rank, and without flags or requests', () => {
    expect(ids([visit('b', 5), visit('a', 2), visit('c', 9)])).toEqual(['a', 'b', 'c']);
    expect(
      ids([
        visit('late', 8, { lineFlags: [flag('REFER_TODAY')] }),
        visit('early', 3, { lineFlags: [flag('REFER_TODAY')] }),
      ]),
    ).toEqual(['early', 'late']);
  });

  it('does not lift a before-they-leave or closed request', () => {
    expect(
      ids([
        visit('leaving', 5, { doctorRequest: request('BEFORE_LEAVING') }),
        visit('closed', 6, { doctorRequest: request('NOW', false) }),
        visit('refer', 7, { lineFlags: [flag('REFER_TODAY')] }),
      ]),
    ).toEqual(['refer', 'leaving', 'closed']);
  });

  it('leaves its input untouched', () => {
    const input = [visit('b', 5), visit('a', 2)];
    sortReviewQueue(input);
    expect(input.map((v) => v.id)).toEqual(['b', 'a']);
  });
});

describe('practice sessions (#410)', () => {
  it.each([
    ['10', 10],
    ['1', 1],
    ['20', 20],
    ['0', null],
    ['21', null],
    ['2.5', null],
    ['', null],
    [' ', null],
  ])('reads the count %p as %p', (raw, value) => {
    expect(practiceCountValue(raw)).toBe(value);
  });

  it('names what a clear changes, including patients with a volunteer now', () => {
    const summary = { charts: 3, openCheckIns: 3, withVolunteer: 1, draftVisits: 1 };
    expect(practiceIsClear(summary)).toBe(false);
    expect(describePracticeClear(summary)).toBe(
      'This takes 3 demo patients out of the line (1 is with a volunteer right now) and deletes ' +
        '1 unfinished visit. Demo charts stay in the patient list, marked cleared. ' +
        'Finished practice visits are kept on the chart and never count in reports.',
    );
  });

  it('says only what stays when nothing is in the line', () => {
    const summary = { charts: 2, openCheckIns: 0, withVolunteer: 0, draftVisits: 0 };
    expect(describePracticeClear(summary)).toMatch(/^Demo charts stay/);
    expect(practiceIsClear({ ...summary, charts: 0 })).toBe(true);
  });
});

describe('daySummaryHref', () => {
  it('keeps a clinic date as a plain path segment', () => {
    expect(daySummaryHref('2026-11-27')).toBe('/stations/day/2026-11-27');
    expect(daySummaryHref('"><img src=x onerror=alert(1)>/../x')).toBe(
      '/stations/day/%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E%2F..%2Fx',
    );
  });
});
