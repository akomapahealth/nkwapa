import { clinicDayWindow } from '@nkwapa/db';
import {
  peakConcurrency,
  STATION_BOTTLENECK_MIN_MINUTES,
  STATION_METRICS_MIN_SAMPLE,
  computeStationMetrics,
  summarizeDurations,
  type StationMetricsInput,
} from './station-metrics';

/*
  Accra is UTC+0 all year, which hides timezone bugs. These run in Africa/Lagos (UTC+1), so a day
  boundary or an hour bucket taken in UTC instead of the clinic's zone lands an hour off.
*/
const TZ = 'Africa/Lagos';
const day = clinicDayWindow('2026-10-08', TZ);
/** A clinic-local wall-clock time on the test day, as a UTC instant. */
const at = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00+01:00`);

const STATIONS = [
  {
    id: 'bp',
    name: 'Blood pressure',
    kind: 'BLOOD_PRESSURE',
    sortOrder: 2,
    active: true,
    capacity: 2,
  },
  { id: 'intake', name: 'Intake', kind: 'INTAKE', sortOrder: 1, active: true, capacity: 1 },
  { id: 'review', name: 'Review', kind: 'REVIEW', sortOrder: 3, active: true, capacity: 1 },
  { id: 'old', name: 'Closed station', kind: 'CUSTOM', sortOrder: 4, active: false, capacity: 1 },
];

function input(overrides: Partial<StationMetricsInput> = {}): StationMetricsInput {
  return {
    day,
    now: at('23:30'),
    stations: STATIONS,
    checkIns: [],
    visits: [],
    shifts: [],
    ...overrides,
  };
}

function visit(
  stationId: string,
  checkInId: string,
  queued: string,
  claimed: string | null,
  completed: string | null,
  status = completed ? 'COMPLETED' : claimed ? 'IN_PROGRESS' : 'QUEUED',
) {
  return {
    stationId,
    patientCheckInId: checkInId,
    status,
    queuedAt: at(queued),
    claimedAt: claimed ? at(claimed) : null,
    completedAt: completed ? at(completed) : null,
    releaseCount: 0,
  };
}

describe('summarizeDurations', () => {
  it('takes the nearest-rank median and 90th percentile, in whole minutes', () => {
    expect(summarizeDurations([10, 2, 4, 8, 6])).toEqual({
      n: 5,
      medianMinutes: 6,
      p90Minutes: 10,
    });
    expect(summarizeDurations([1.4, 3.6])).toEqual({ n: 2, medianMinutes: 1, p90Minutes: 4 });
  });

  it('reports no figure rather than zero when nothing was measured', () => {
    expect(summarizeDurations([])).toEqual({ n: 0, medianMinutes: null, p90Minutes: null });
  });

  it('drops a negative duration from clocks that disagree', () => {
    expect(summarizeDurations([-3, 5])).toEqual({ n: 1, medianMinutes: 5, p90Minutes: 5 });
  });
});

describe('computeStationMetrics', () => {
  it('handles a clinic with nothing on the day', () => {
    const metrics = computeStationMetrics(input());
    expect(metrics).toMatchObject({
      date: '2026-10-08',
      timezone: TZ,
      lowVolume: true,
      checkIns: { total: 0, completed: 0, leftEarly: 0, inClinicNow: 0 },
      timeInClinic: { n: 0, medianMinutes: null },
      bottleneckStationId: null,
      hourly: [],
    });
    // In station order, without the closed station that saw nobody.
    expect(metrics.stations.map((station) => station.stationId)).toEqual([
      'intake',
      'bp',
      'review',
    ]);
  });

  it("measures each station's wait and service time from its own visits", () => {
    const metrics = computeStationMetrics(
      input({
        visits: [
          visit('bp', 'c1', '09:00', '09:10', '09:15'),
          visit('bp', 'c2', '09:05', '09:25', '09:30'),
          visit('bp', 'c3', '09:10', '09:40', null),
          visit('intake', 'c4', '09:00', null, null, 'SKIPPED'),
        ],
      }),
    );
    const bp = metrics.stations.find((station) => station.stationId === 'bp')!;
    expect(bp).toMatchObject({
      seen: 2,
      // Waits of 10, 20 and 30 minutes, including the patient still being seen.
      wait: { n: 3, medianMinutes: 20, p90Minutes: 30 },
      // Service only for visits that finished.
      service: { n: 2, medianMinutes: 5 },
    });
    expect(metrics.stations.find((station) => station.stationId === 'intake')!.skipped).toBe(1);
  });

  it('names the station with the longest median wait as the bottleneck, given enough patients', () => {
    const waits = (stationId: string, minutes: number[]) =>
      minutes.map((wait, index) =>
        visit(
          stationId,
          `${stationId}-${index}`,
          '10:00',
          `10:${String(wait).padStart(2, '0')}`,
          null,
        ),
      );
    const metrics = computeStationMetrics(
      input({ visits: [...waits('intake', [5, 6, 7]), ...waits('bp', [30, 35, 40])] }),
    );
    expect(metrics.bottleneckStationId).toBe('bp');

    // One very slow patient is not a bottleneck.
    const thin = computeStationMetrics(
      input({ visits: [...waits('intake', [5, 6, 7]), ...waits('bp', [50])] }),
    );
    expect(STATION_METRICS_MIN_SAMPLE).toBeGreaterThan(1);
    expect(thin.bottleneckStationId).toBe('intake');
  });

  it('names no bottleneck when every wait is short', () => {
    const quick = (stationId: string) =>
      [1, 2, 3].map((wait, index) =>
        visit(stationId, `${stationId}-${index}`, '10:00', `10:0${wait}`, null),
      );
    const metrics = computeStationMetrics(input({ visits: [...quick('intake'), ...quick('bp')] }));
    expect(STATION_BOTTLENECK_MIN_MINUTES).toBeGreaterThan(3);
    expect(metrics.bottleneckStationId).toBeNull();
  });

  it('counts check-ins by outcome and times a finished session from check-in to the end of review', () => {
    const metrics = computeStationMetrics(
      input({
        checkIns: [
          { id: 'c1', checkedInAt: at('08:50'), status: 'COMPLETED' },
          { id: 'c2', checkedInAt: at('09:00'), status: 'COMPLETED' },
          { id: 'c3', checkedInAt: at('09:10'), status: 'CANCELLED' },
          { id: 'c4', checkedInAt: at('09:20'), status: 'IN_PROGRESS' },
          { id: 'c5', checkedInAt: at('09:30'), status: 'WAITING' },
        ],
        visits: [
          visit('review', 'c1', '09:30', '09:35', '09:50'),
          visit('review', 'c2', '10:00', '10:05', '10:30'),
        ],
      }),
    );
    expect(metrics.checkIns).toEqual({ total: 5, completed: 2, leftEarly: 1, inClinicNow: 2 });
    expect(metrics.timeInClinic).toEqual({ n: 2, medianMinutes: 60, p90Minutes: 90 });
    expect(metrics.lowVolume).toBe(false);
  });

  it('buckets arrivals and completions by the clinic-local hour, filling the hours between', () => {
    const metrics = computeStationMetrics(
      input({
        checkIns: [
          { id: 'c1', checkedInAt: at('08:10'), status: 'COMPLETED' },
          { id: 'c2', checkedInAt: at('08:50'), status: 'WAITING' },
        ],
        visits: [visit('review', 'c1', '10:00', '10:05', '10:20')],
      }),
    );
    expect(metrics.hourly).toEqual([
      { hour: '08:00', checkedIn: 2, completed: 0 },
      { hour: '09:00', checkedIn: 0, completed: 0 },
      { hour: '10:00', checkedIn: 0, completed: 1 },
    ]);
  });

  it('reports who is waiting and who is working only while the day is live', () => {
    const live = input({
      now: at('11:00'),
      visits: [visit('bp', 'c1', '10:15', null, null), visit('bp', 'c2', '10:45', null, null)],
      shifts: [
        { userId: 'v1', stationId: 'bp', status: 'ACTIVE' },
        { userId: 'v2', stationId: null, status: 'ACTIVE' },
        { userId: 'v3', stationId: 'bp', status: 'ENDED' },
      ],
    });
    const today = computeStationMetrics(live);
    expect(today.live).toBe(true);
    expect(today.staffing.onShiftNow).toBe(2);
    expect(today.stations.find((station) => station.stationId === 'bp')).toMatchObject({
      waitingNow: 2,
      longestCurrentWaitMinutes: 45,
      staffNow: 1,
    });

    const pastDay = computeStationMetrics({ ...live, now: new Date('2026-10-10T10:00:00Z') });
    expect(pastDay.live).toBe(false);
    expect(pastDay.staffing.onShiftNow).toBeNull();
    expect(pastDay.stations.find((station) => station.stationId === 'bp')).toMatchObject({
      waitingNow: null,
      longestCurrentWaitMinutes: null,
      staffNow: null,
    });
  });

  it('carries no patient or staff identifier in its output', () => {
    const metrics = computeStationMetrics(
      input({
        checkIns: [{ id: 'checkin-secret', checkedInAt: at('09:00'), status: 'COMPLETED' }],
        visits: [visit('review', 'checkin-secret', '09:10', '09:15', '09:40')],
        shifts: [{ userId: 'user-secret', stationId: 'review', status: 'ACTIVE' }],
      }),
    );
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toContain('checkin-secret');
    expect(serialized).not.toContain('user-secret');
  });
});

describe('station capacity (#32)', () => {
  it('finds the most patients seen at once, not counting a hand-on and the next take as overlap', () => {
    const iv = (from: string, to: string) => ({ start: at(from), end: at(to) });
    expect(peakConcurrency([])).toBe(0);
    expect(peakConcurrency([iv('09:00', '09:10'), iv('09:10', '09:20')])).toBe(1);
    expect(
      peakConcurrency([iv('09:00', '09:30'), iv('09:05', '09:15'), iv('09:10', '09:20')]),
    ).toBe(3);
  });

  it('reports each station’s capacity and its busiest moment', () => {
    const metrics = computeStationMetrics(
      input({
        visits: [
          visit('bp', 'c1', '09:00', '09:05', '09:20'),
          visit('bp', 'c2', '09:00', '09:10', '09:25'),
          visit('bp', 'c3', '09:00', '09:30', '09:40'),
        ],
      }),
    );
    expect(metrics.stations.find((s) => s.stationId === 'bp')).toMatchObject({
      capacity: 2,
      peakInUse: 2,
    });
  });

  const slowAt = (stationId: string, overlapping: boolean) =>
    [0, 1, 2].map((index) =>
      overlapping
        ? // Taken late and all at once: the station was full.
          visit(stationId, `${stationId}-${index}`, '09:00', '09:30', '09:50')
        : // Taken late one after another: there was room, nobody to take them.
          visit(
            stationId,
            `${stationId}-${index}`,
            '09:00',
            `09:${30 + index * 10}`,
            `09:${35 + index * 10}`,
          ),
    );

  it('says a long wait at a full station is a capacity problem', () => {
    const metrics = computeStationMetrics(input({ visits: slowAt('intake', true) }));
    expect(metrics.bottleneckStationId).toBe('intake');
    expect(metrics.bottleneckConstraint).toBe('CAPACITY');
  });

  it('says a long wait at a station that never filled is a staffing problem', () => {
    const metrics = computeStationMetrics(input({ visits: slowAt('bp', false) }));
    expect(metrics.bottleneckStationId).toBe('bp');
    expect(metrics.stations.find((s) => s.stationId === 'bp')!.peakInUse).toBe(1);
    expect(metrics.bottleneckConstraint).toBe('STAFFING');
  });

  it('has no constraint to report without a bottleneck', () => {
    expect(computeStationMetrics(input()).bottleneckConstraint).toBeNull();
  });
});

describe('StationService.getMetrics', () => {
  it("reads only this clinic's rows, inside the clinic-local day", async () => {
    // Imported here so the arithmetic above stays free of Nest.
    const { StationService } = await import('./station.service');
    const prisma = {
      clinic: { findUnique: jest.fn().mockResolvedValue({ timezone: TZ }) },
      clinicStation: { findMany: jest.fn().mockResolvedValue([]) },
      patientCheckIn: { findMany: jest.fn().mockResolvedValue([]) },
      patientStationVisit: { findMany: jest.fn().mockResolvedValue([]) },
      staffShift: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StationService(prisma as never, {} as never);

    const metrics = await service.getMetrics('clinic-1', '2026-10-08', at('12:00'));

    const window = { gte: day.start, lte: day.end };
    expect(prisma.patientCheckIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clinicId: 'clinic-1', checkedInAt: window } }),
    );
    expect(prisma.patientStationVisit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId: 'clinic-1', patientCheckIn: { checkedInAt: window } },
      }),
    );
    expect(prisma.staffShift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: 'clinic-1',
          checkedInAt: { lte: day.end },
          OR: [{ checkedOutAt: null }, { checkedOutAt: { gte: day.start } }],
        },
      }),
    );
    // Lagos midnight is 23:00 UTC the evening before.
    expect(day.start.toISOString()).toBe('2026-10-07T23:00:00.000Z');
    expect(metrics).toMatchObject({ date: '2026-10-08', timezone: TZ, live: true });
  });
});
