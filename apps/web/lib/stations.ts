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
  /**
   * Who actually did the stop when it wasn't the account holder (#227). Null when it was, or the
   * stop predates it; absent from copies saved before it.
   */
  performedByName?: string | null;
  handoffNote: string | null;
  endReason: string | null;
  releaseCount: number;
  previous: {
    station: StationVisit['station'];
    completedBy: StaffSummary | null;
    completedAt: string | null;
    performedByName?: string | null;
    handoffNote: string | null;
  } | null;
}

export interface StationBoard {
  date: string;
  timezone: string;
  stations: Array<
    ClinicStation & { staff: OnStationStaff[]; visits: StationVisit[]; inUse?: number }
  >;
  /** Everyone on shift. Absent from a board saved on this device before managers could assign. */
  onShift?: OnShiftStaff[];
}

/**
 * Whether a value is a station board, for checking a copy saved on the device before it is drawn.
 * Structural only: it tells a board apart from another view's shape, not a well-formed board.
 */
export function isStationBoard(value: unknown): value is StationBoard {
  if (typeof value !== 'object' || value === null) return false;
  const board = value as Partial<StationBoard>;
  return typeof board.timezone === 'string' && Array.isArray(board.stations);
}

/** Someone working at a station, and who is really screening on their account (#227). */
export interface OnStationStaff extends StaffSummary {
  screenerName?: string | null;
}

export interface OnShiftStaff {
  /** Absent from a board saved before #227. */
  shiftId?: string;
  user: StaffSummary;
  /** Who is really screening on this account; null when it's the account holder (#227). */
  screenerName?: string | null;
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
    screener?: Screener;
  },
  getToken: GetToken,
) =>
  request<CompleteVisitResult>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/complete`,
    getToken,
    { method: 'POST', body },
  );

/** Who is working on the account (#227). `name` is required when it's not the account holder. */
export interface Screener {
  isAccountHolder: boolean;
  name?: string;
}

/** The screener a board names, in the shape the API takes. */
export const screenerFromName = (screenerName: string | null | undefined): Screener =>
  screenerName ? { isAccountHolder: false, name: screenerName } : { isAccountHolder: true };

/** "Ama Mensah · signed in as Kofi Boateng", or just the account when they are the same person. */
export const performerLabel = (account: string, performedByName: string | null | undefined) =>
  performedByName ? `${performedByName} · signed in as ${account}` : account;

/** "Kofi Boateng (Ama Mensah screening)" when someone else works on the account. */
export const withScreener = (displayName: string, screenerName: string | null | undefined) =>
  screenerName ? `${displayName} (${screenerName} screening)` : displayName;

/** The live screener on each account on shift, for naming who holds a patient now. */
export const screenersByUser = (onShift: OnShiftStaff[] | undefined) =>
  new Map((onShift ?? []).map((shift) => [shift.user.id, shift.screenerName ?? null]));

export const setShiftScreener = (
  clinicId: string,
  shiftId: string,
  screener: Screener,
  getToken: GetToken,
) =>
  request<{ shiftId: string; screenerIsAccountHolder: boolean; screenerName: string | null }>(
    clinicId,
    `/shifts/${encodeURIComponent(shiftId)}/screener`,
    getToken,
    { method: 'PATCH', body: screener },
  );

/**
 * Names people have screened under at this clinic lately, for the screener field (#227). Comes
 * from past stops until the volunteer directory (#226) exists; then each item gains its contact id.
 */
export const fetchScreenerNames = (clinicId: string, getToken: GetToken) =>
  request<{ items: Array<{ name: string; lastUsedAt: string | null }> }>(
    clinicId,
    '/stations/screener-names',
    getToken,
  );

/**
 * Whether to offer fixing who did a stop (#227). The server decides: this only hides the offer
 * where it would be refused. The completing account may until the session is done (its
 * counselling is then locked); a manager always may.
 */
export const canCorrectPerformer = (
  stop: Pick<StationVisit, 'status' | 'completedBy' | 'checkInStatus'>,
  viewer: { userId: string; canManage: boolean },
) =>
  (stop.status === 'COMPLETED' || stop.status === 'SKIPPED') &&
  (viewer.canManage ||
    (stop.completedBy?.id === viewer.userId && stop.checkInStatus !== 'COMPLETED'));

/** Fix who did a finished stop, with a reason (#227). */
export const correctPerformer = (
  clinicId: string,
  visitId: string,
  body: Screener & { reason: string },
  getToken: GetToken,
) =>
  request<StationVisit>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/performer`,
    getToken,
    { method: 'PATCH', body },
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
