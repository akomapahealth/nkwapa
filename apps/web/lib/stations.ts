'use client';

import { useEffect } from 'react';
import { nextStationId, type StationKindValue } from '@nkwapa/db/clinic-stations';
import { apiFetch, type GetToken } from './api';
import { readApiError } from './ops';

/**
 * The station line (#167), as the web sees it.
 *
 * Reading the line works from this device's saved copy when offline. Changing who holds a
 * patient never does: claim, release, hand-off, move and "patient left" are decided by the
 * server, so two volunteers can never both believe they have the same patient.
 */

export type StationKind = StationKindValue;
export type StationVisitStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

export interface ClinicStation {
  id: string;
  kind: StationKind;
  name: string;
  sortOrder: number;
  active: boolean;
  /** How many patients it can see at once (#32). Absent from a board saved before it existed. */
  capacity?: number;
}

export interface StaffSummary {
  id: string;
  displayName: string;
}

export interface StationVisit {
  id: string;
  status: StationVisitStatus;
  checkInId: string;
  checkInStatus: string;
  checkedInAt: string;
  encounterId: string | null;
  station: Pick<ClinicStation, 'id' | 'kind' | 'name' | 'sortOrder'>;
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    dob: string | null;
  };
  queuedAt: string;
  claimedBy: StaffSummary | null;
  claimedAt: string | null;
  /** The manager who handed the patient to `claimedBy`; null when they took the patient themselves. */
  assignedBy?: StaffSummary | null;
  completedBy: StaffSummary | null;
  completedAt: string | null;
  handoffNote: string | null;
  endReason: string | null;
  releaseCount: number;
  previous: {
    station: StationVisit['station'];
    completedBy: StaffSummary | null;
    completedAt: string | null;
    handoffNote: string | null;
  } | null;
}

export interface StationBoard {
  date: string;
  timezone: string;
  stations: Array<
    ClinicStation & { staff: StaffSummary[]; visits: StationVisit[]; inUse?: number }
  >;
  /** Everyone on shift. Absent from a board saved on this device before managers could assign. */
  onShift?: OnShiftStaff[];
}

export interface OnShiftStaff {
  user: StaffSummary;
  roleAtShift: 'VOLUNTEER' | 'DOCTOR' | 'MANAGER';
  stationId: string | null;
  activeVisitCount: number;
}

export interface StationVisitDetail extends StationVisit {
  timeline: StationVisit[];
}

export interface CompleteVisitResult {
  visit: StationVisit;
  nextVisitId: string | null;
  nextStationId: string | null;
  sessionCompleted: boolean;
}

/** How often an open station screen re-reads the line. Polling, not push, in v1. */
export const STATION_POLL_MS = 12_000;

/** A failed station request, with the server's code so the screen can say what happened. */
export class StationRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  clinicId: string,
  path: string,
  getToken: GetToken,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}${path}`, {
    method: init.method ?? 'GET',
    getToken,
    activeClinicId: clinicId,
    signal: init.signal,
    ...(init.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
  if (!response.ok) {
    const code = await readErrorCode(response.clone());
    throw new StationRequestError(await readApiError(response), code, response.status);
  }
  return (await response.json()) as T;
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

export const fetchStationBoard = (
  clinicId: string,
  date: string,
  getToken: GetToken,
  signal?: AbortSignal,
) =>
  request<StationBoard>(clinicId, `/stations/board?date=${encodeURIComponent(date)}`, getToken, {
    signal,
  });

export interface DurationSummary {
  n: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
}

/** Wait-time and throughput for one clinic day (#24). Aggregates only. */
export interface StationMetrics {
  date: string;
  timezone: string;
  live: boolean;
  lowVolume: boolean;
  checkIns: { total: number; completed: number; leftEarly: number; inClinicNow: number };
  timeInClinic: DurationSummary;
  stations: Array<{
    stationId: string;
    name: string;
    kind: StationKind;
    active: boolean;
    seen: number;
    skipped: number;
    wait: DurationSummary;
    service: DurationSummary;
    releases: number;
    capacity?: number;
    peakInUse?: number;
    waitingNow: number | null;
    longestCurrentWaitMinutes: number | null;
    staffNow: number | null;
  }>;
  bottleneckStationId: string | null;
  bottleneckConstraint?: 'CAPACITY' | 'STAFFING' | null;
  hourly: Array<{ hour: string; checkedIn: number; completed: number }>;
  staffing: { onShiftNow: number | null };
}

/** With no date, the server answers for today in the clinic's own timezone. */
export const fetchStationMetrics = (
  clinicId: string,
  date: string | null,
  getToken: GetToken,
  signal?: AbortSignal,
) =>
  request<StationMetrics>(
    clinicId,
    `/stations/metrics${date ? `?date=${encodeURIComponent(date)}` : ''}`,
    getToken,
    { signal },
  );

/** "12 min", "1 h 05 min", or an en dash when nothing was measured. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '–';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Station setup, for managers (#32). The server keeps exactly one active review station. */
export const createStation = (
  clinicId: string,
  body: { kind: StationKind; name: string; capacity: number },
  getToken: GetToken,
) => request<ClinicStation>(clinicId, '/stations', getToken, { method: 'POST', body });

export const updateStation = (
  clinicId: string,
  stationId: string,
  body: { name?: string; active?: boolean; capacity?: number },
  getToken: GetToken,
) =>
  request<ClinicStation>(clinicId, `/stations/${encodeURIComponent(stationId)}`, getToken, {
    method: 'PATCH',
    body,
  });

export const reorderStations = (clinicId: string, stationIds: string[], getToken: GetToken) =>
  request<{ items: ClinicStation[] }>(clinicId, '/stations/order', getToken, {
    method: 'PUT',
    body: { stationIds },
  });

/** A station's place moved one step up or down, as the full order the API expects. */
export function moveStation(
  stations: readonly Pick<ClinicStation, 'id'>[],
  stationId: string,
  direction: -1 | 1,
): string[] {
  const ids = stations.map((station) => station.id);
  const from = ids.indexOf(stationId);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

export const fetchStations = (clinicId: string, getToken: GetToken) =>
  request<{ items: ClinicStation[] }>(clinicId, '/stations', getToken);

export const fetchStationVisit = (clinicId: string, visitId: string, getToken: GetToken) =>
  request<StationVisitDetail>(clinicId, `/station-visits/${encodeURIComponent(visitId)}`, getToken);

export const fetchEncounterStationTimeline = (
  clinicId: string,
  encounterId: string,
  getToken: GetToken,
) =>
  request<{ items: StationVisit[] }>(
    clinicId,
    `/encounters/${encodeURIComponent(encounterId)}/station-visits`,
    getToken,
  );

export const claimStationVisit = (clinicId: string, visitId: string, getToken: GetToken) =>
  request<StationVisit>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/claim`,
    getToken,
    {
      method: 'POST',
    },
  );

/** Manager hands a waiting patient to a named person on shift. */
export const assignStationVisit = (
  clinicId: string,
  visitId: string,
  assigneeUserId: string,
  getToken: GetToken,
) =>
  request<StationVisit>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/assign`,
    getToken,
    { method: 'POST', body: { assigneeUserId } },
  );

export const releaseStationVisit = (
  clinicId: string,
  visitId: string,
  reason: string,
  getToken: GetToken,
  options: { force?: boolean } = {},
) =>
  request<StationVisit>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/${options.force ? 'force-release' : 'release'}`,
    getToken,
    { method: 'POST', body: { reason } },
  );

export const completeStationVisit = (
  clinicId: string,
  visitId: string,
  body: {
    handoffNote?: string;
    nextStationId?: string;
    skips?: Array<{ stationId: string; reason: string }>;
  },
  getToken: GetToken,
) =>
  request<CompleteVisitResult>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/complete`,
    getToken,
    { method: 'POST', body },
  );

export const setShiftStation = (
  clinicId: string,
  shiftId: string,
  stationId: string | null,
  getToken: GetToken,
) =>
  request<{ shiftId: string; stationId: string | null }>(
    clinicId,
    `/shifts/${encodeURIComponent(shiftId)}/station`,
    getToken,
    { method: 'PATCH', body: { stationId } },
  );

export const moveCheckIn = (
  clinicId: string,
  checkInId: string,
  stationId: string,
  reason: string,
  getToken: GetToken,
) =>
  request<{ visitId: string; stationId: string }>(
    clinicId,
    `/checkins/${encodeURIComponent(checkInId)}/move`,
    getToken,
    { method: 'POST', body: { stationId, reason } },
  );

export const cancelCheckIn = (
  clinicId: string,
  checkInId: string,
  reason: string,
  getToken: GetToken,
) =>
  request<{ checkInId: string; status: 'CANCELLED' }>(
    clinicId,
    `/checkins/${encodeURIComponent(checkInId)}/cancel`,
    getToken,
    { method: 'POST', body: { reason } },
  );

/**
 * Who a manager can hand a patient at `stationId` to: the people working that station first,
 * then everyone else on shift, each group with the least busy first.
 */
export function assignableStaff(
  onShift: readonly OnShiftStaff[],
  stationId: string,
): { atStation: OnShiftStaff[]; elsewhere: OnShiftStaff[] } {
  const byLoad = (a: OnShiftStaff, b: OnShiftStaff) =>
    a.activeVisitCount - b.activeVisitCount || a.user.displayName.localeCompare(b.user.displayName);
  return {
    atStation: onShift.filter((s) => s.stationId === stationId).sort(byLoad),
    elsewhere: onShift.filter((s) => s.stationId !== stationId).sort(byLoad),
  };
}

/**
 * The station a patient goes to next if the volunteer changes nothing: the next active station in
 * order, passing over any they chose to skip, or null after the review station.
 */
export function suggestedNextStation(
  stations: readonly ClinicStation[],
  currentStationId: string,
  skipped: readonly string[] = [],
): ClinicStation | null {
  const id = nextStationId(stations, currentStationId, new Set(skipped));
  return stations.find((station) => station.id === id) ?? null;
}

/** Active stations strictly between the current one and the chosen next one, in order. */
export function stationsPassedOver(
  stations: readonly ClinicStation[],
  currentStationId: string,
  nextId: string,
): ClinicStation[] {
  const current = stations.find((station) => station.id === currentStationId);
  const next = stations.find((station) => station.id === nextId);
  if (!current || !next || next.sortOrder <= current.sortOrder) return [];
  return stations
    .filter(
      (station) =>
        station.active &&
        station.kind !== 'REVIEW' &&
        station.sortOrder > current.sortOrder &&
        station.sortOrder < next.sortOrder,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Whole minutes since an ISO time, for "waiting 12 min". */
export function minutesSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
}

export function patientName(patient: StationVisit['patient']): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

/** Re-run `refresh` every `intervalMs` while the tab is visible and online. */
export function usePolling(refresh: () => void, enabled: boolean, intervalMs = STATION_POLL_MS) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, enabled, intervalMs]);
}
