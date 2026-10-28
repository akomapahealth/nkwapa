import {
  assignableStaff,
  canCorrectPerformer,
  formatMinutes,
  isStationBoard,
  moveStation,
  minutesSince,
  performerLabel,
  screenerFromName,
  screenersByUser,
  stationsPassedOver,
  suggestedNextStation,
  withScreener,
  type ClinicStation,
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
