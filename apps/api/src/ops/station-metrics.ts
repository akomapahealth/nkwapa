import type { ClinicDayWindow } from '@nkwapa/db';

/**
 * Wait-time and throughput for one clinic day on the station line (#24).
 *
 * Built on the station visit timestamps (#167), not on `PatientAssignment`, which the station line
 * replaces: a visit records when the patient joined a station's queue (`queuedAt`), when someone
 * took them (`claimedAt`) and when they were handed on (`completedAt`), so every station's wait
 * and service time falls out directly.
 *
 * Kept free of Prisma so the arithmetic can be tested on plain rows. Everything returned is an
 * aggregate: no patient, and no member of staff, is identifiable from it.
 */

/** Below this many measurements a median is reported but not compared: one slow patient is not a bottleneck. */
export const STATION_METRICS_MIN_SAMPLE = 3;
/**
 * A wait shorter than this is not a bottleneck, however it compares: on a quiet morning every
 * station is "slowest" at nought minutes, and naming one would send a manager looking for nothing.
 */
export const STATION_BOTTLENECK_MIN_MINUTES = 5;
/** A day with fewer check-ins than this is labelled low volume, so nobody reads a trend into it. */
export const STATION_METRICS_LOW_VOLUME = 5;

export interface StationMetricsInput {
  day: ClinicDayWindow;
  now: Date;
  stations: ReadonlyArray<{
    id: string;
    name: string;
    kind: string;
    sortOrder: number;
    active: boolean;
  }>;
  checkIns: ReadonlyArray<{ id: string; checkedInAt: Date; status: string }>;
  visits: ReadonlyArray<{
    stationId: string;
    patientCheckInId: string;
    status: string;
    queuedAt: Date;
    claimedAt: Date | null;
    completedAt: Date | null;
    releaseCount: number;
  }>;
  shifts: ReadonlyArray<{ userId: string; stationId: string | null; status: string }>;
}

export interface DurationSummary {
  /** How many measurements the figures below are drawn from. */
  n: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
}

export interface StationMetrics {
  date: string;
  timezone: string;
  /** Whether the day is today, so the "now" figures mean something. */
  live: boolean;
  lowVolume: boolean;
  checkIns: { total: number; completed: number; leftEarly: number; inClinicNow: number };
  /** Check-in to the end of the review station, for sessions that finished. */
  timeInClinic: DurationSummary;
  stations: Array<{
    stationId: string;
    name: string;
    kind: string;
    active: boolean;
    seen: number;
    skipped: number;
    /** Queue to claim: how long patients waited for someone at this station. */
    wait: DurationSummary;
    /** Claim to hand-on: how long they spent being seen. */
    service: DurationSummary;
    /** Times a patient was put back in this station's queue. */
    releases: number;
    /** Null on a past day. */
    waitingNow: number | null;
    longestCurrentWaitMinutes: number | null;
    staffNow: number | null;
  }>;
  /**
   * The station with the longest median wait, among those with enough measurements to compare and
   * a wait long enough to matter. Null when nothing qualifies.
   */
  bottleneckStationId: string | null;
  /** Clinic-local hours from the first to the last activity of the day. */
  hourly: Array<{ hour: string; checkedIn: number; completed: number }>;
  staffing: { onShiftNow: number | null };
}

const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;

/** Nearest-rank percentile of sorted values, rounded to whole minutes. */
function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

export function summarizeDurations(minutes: number[]): DurationSummary {
  // A clock that went backwards between two devices is not a negative wait.
  const sorted = minutes
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  return {
    n: sorted.length,
    medianMinutes: percentile(sorted, 50),
    p90Minutes: percentile(sorted, 90),
  };
}

function localHour(instant: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(instant)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

const OPEN_CHECK_IN = new Set(['WAITING', 'ASSIGNED', 'IN_PROGRESS']);

export function computeStationMetrics(input: StationMetricsInput): StationMetrics {
  const { day, now, checkIns, visits } = input;
  const live = now >= day.start && now <= day.end;
  const stationKind = new Map(input.stations.map((station) => [station.id, station.kind]));

  const sessionEnd = new Map<string, Date>();
  for (const visit of visits) {
    if (
      stationKind.get(visit.stationId) === 'REVIEW' &&
      visit.status === 'COMPLETED' &&
      visit.completedAt
    ) {
      sessionEnd.set(visit.patientCheckInId, visit.completedAt);
    }
  }
  const timeInClinic = summarizeDurations(
    checkIns
      .filter((checkIn) => checkIn.status === 'COMPLETED' && sessionEnd.has(checkIn.id))
      .map((checkIn) => minutesBetween(checkIn.checkedInAt, sessionEnd.get(checkIn.id)!)),
  );

  const stations = [...input.stations]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((station) => {
      const atStation = visits.filter((visit) => visit.stationId === station.id);
      const queued = atStation.filter((visit) => visit.status === 'QUEUED');
      return {
        stationId: station.id,
        name: station.name,
        kind: station.kind,
        active: station.active,
        seen: atStation.filter((visit) => visit.status === 'COMPLETED').length,
        skipped: atStation.filter((visit) => visit.status === 'SKIPPED').length,
        wait: summarizeDurations(
          atStation
            .filter((visit) => visit.claimedAt)
            .map((visit) => minutesBetween(visit.queuedAt, visit.claimedAt!)),
        ),
        service: summarizeDurations(
          atStation
            .filter((visit) => visit.status === 'COMPLETED' && visit.claimedAt && visit.completedAt)
            .map((visit) => minutesBetween(visit.claimedAt!, visit.completedAt!)),
        ),
        releases: atStation.reduce((sum, visit) => sum + visit.releaseCount, 0),
        waitingNow: live ? queued.length : null,
        longestCurrentWaitMinutes:
          live && queued.length
            ? Math.round(Math.max(...queued.map((visit) => minutesBetween(visit.queuedAt, now))))
            : null,
        staffNow: live
          ? input.shifts.filter(
              (shift) => shift.status === 'ACTIVE' && shift.stationId === station.id,
            ).length
          : null,
      };
    })
    // A closed station with nothing recorded today is noise; one that saw patients before closing is not.
    .filter(
      (station) =>
        station.active || station.seen + station.skipped > 0 || (station.waitingNow ?? 0) > 0,
    );

  const comparable = stations.filter(
    (station) =>
      station.wait.n >= STATION_METRICS_MIN_SAMPLE &&
      station.wait.medianMinutes !== null &&
      station.wait.medianMinutes >= STATION_BOTTLENECK_MIN_MINUTES,
  );
  const bottleneck = comparable.reduce<(typeof stations)[number] | null>(
    (worst, station) =>
      !worst || station.wait.medianMinutes! > worst.wait.medianMinutes! ? station : worst,
    null,
  );

  const arrivals = checkIns.map((checkIn) => localHour(checkIn.checkedInAt, day.timezone));
  const departures = [...sessionEnd.values()].map((end) => localHour(end, day.timezone));
  const activeHours = [...arrivals, ...departures];
  const hourly =
    activeHours.length === 0
      ? []
      : Array.from(
          { length: Math.max(...activeHours) - Math.min(...activeHours) + 1 },
          (_, offset) => {
            const hour = Math.min(...activeHours) + offset;
            return {
              hour: `${String(hour).padStart(2, '0')}:00`,
              checkedIn: arrivals.filter((value) => value === hour).length,
              completed: departures.filter((value) => value === hour).length,
            };
          },
        );

  return {
    date: day.date,
    timezone: day.timezone,
    live,
    lowVolume: checkIns.length < STATION_METRICS_LOW_VOLUME,
    checkIns: {
      total: checkIns.length,
      completed: checkIns.filter((checkIn) => checkIn.status === 'COMPLETED').length,
      leftEarly: checkIns.filter((checkIn) => checkIn.status === 'CANCELLED').length,
      inClinicNow: checkIns.filter((checkIn) => OPEN_CHECK_IN.has(checkIn.status)).length,
    },
    timeInClinic,
    stations,
    bottleneckStationId: bottleneck?.stationId ?? null,
    hourly,
    staffing: {
      onShiftNow: live ? input.shifts.filter((shift) => shift.status === 'ACTIVE').length : null,
    },
  };
}
