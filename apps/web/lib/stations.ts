'use client';

import { formatPersonName } from './person-name';
import { useCallback, useEffect, useState } from 'react';
import { nextStationId, type StationKindValue } from '@nkwapa/db/clinic-stations';
import type { DoctorRequest, DoctorRequestReason, DoctorRequestUrgency } from './doctor-requests';
import { worstLineFlag, type LineFlag } from '@nkwapa/db/station-line-flags';
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
  /** Today's number at this clinic (#413). Absent on copies saved before it existed. */
  dayNumber?: number | null;
  /** Red flags raised along the line so far (#415). Absent on copies saved before it existed. */
  lineFlags?: LineFlag[];
  /** The open "Ask a doctor" on this check-in (#418), with who took it. */
  doctorRequest?: DoctorRequest | null;
  /** BP, glucose and BMI so far, on visits at the review station only (#419). */
  keyReadings?: KeyReadings;
  encounterId: string | null;
  station: Pick<ClinicStation, 'id' | 'kind' | 'name' | 'sortOrder'>;
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    dob: string | null;
    /** A training chart. Optional: copies saved on a device before 2026-11-21 lack it. */
    isDemo?: boolean;
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
  /** The latest change to who did this stop, from the audit trail (#307). */
  performerCorrection?: PerformerCorrection | null;
  previous: {
    station: StationVisit['station'];
    /** SKIPPED when the stop ended with nothing recorded (#424). Absent from copies saved before. */
    status?: StationVisitStatus;
    completedBy: StaffSummary | null;
    completedAt: string | null;
    performedByName?: string | null;
    handoffNote: string | null;
  } | null;
}

export interface KeyReadings {
  bp: { systolic: number; diastolic: number } | null;
  glucose: { mgDl: number; type: string } | null;
  bmi: number | null;
}

export interface PerformerCorrection {
  /** Who the stop named before the correction; null when that is not known. */
  previousPerformer: string | null;
  correctedAt: string;
  correctedBy: { id: string; displayName: string };
  reason: string | null;
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
  /** A refer-today reading asked for a doctor with no tap (#418). */
  doctorRequested?: boolean;
}

/** How often an open station screen re-reads the line. Polling, not push, in v1. */
export const STATION_POLL_MS = 6_000;

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
  checkIns: {
    total: number;
    completed: number;
    leftEarly: number;
    /** Still in the line when the day was closed, so never finished review (#409). */
    closedAtDayEnd: number;
    inClinicNow: number;
  };
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
    /** Stops held and then handed on with nothing recorded (#424). */
    heldEmpty: number;
    longestHeldMinutes: number | null;
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

/** How one clinic day went (#421). Counts only; demo patients are counted apart. */
export interface ClinicDaySummary {
  metrics: StationMetrics;
  demoCheckIns: number;
  patients: { new: number; returning: number };
  clinical: {
    referrals: { urgent: number; soon: number; routine: number; unspecified: number };
    bpReferToday: number;
    bpRecheck: number;
    glucoseReferToday: number;
    glucoseRaised: number;
  };
  openWork: { drafts: number; inReview: number; notesToCosignAnyDay: number };
  staff: { volunteers: number; doctors: number; managers: number };
}

export const fetchClinicDaySummary = (
  clinicId: string,
  date: string,
  getToken: GetToken,
  signal?: AbortSignal,
) =>
  request<ClinicDaySummary>(
    clinicId,
    `/stations/day/summary?date=${encodeURIComponent(date)}`,
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
    /** Complete review although a refer-today flag has no referral (#415). */
    acknowledgeNoReferral?: boolean;
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
  /** Picked from the volunteer directory (#226); the server then takes the name from it. */
  volunteerContactId?: string;
}

/** The screener a board names, in the shape the API takes. */
export const screenerFromName = (screenerName: string | null | undefined): Screener =>
  screenerName ? { isAccountHolder: false, name: screenerName } : { isAccountHolder: true };

/** "Ama Mensah · signed in as Kofi Boateng", or just the account when they are the same person. */
export const performerLabel = (account: string, performedByName: string | null | undefined) =>
  performedByName ? `${performedByName} · signed in as ${account}` : account;

/**
 * One stop on an encounter's route, in words: "Cancelled by Kofi Boateng, 3 Nov, 10:04".
 * A cancelled stop keeps its station name (struck through by the caller) beside who and when.
 */
export function describeRouteStop(
  stop: Pick<
    StationVisit,
    'status' | 'completedBy' | 'completedAt' | 'performedByName' | 'endReason'
  >,
  formatTime: (iso: string) => string,
) {
  const verb: Record<StationVisitStatus, string> = {
    QUEUED: 'Queued',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    SKIPPED: 'Skipped',
    CANCELLED: 'Cancelled',
  };
  const who = stop.completedBy
    ? ` by ${performerLabel(stop.completedBy.displayName, stop.performedByName)}`
    : '';
  const when = stop.completedAt ? `, ${formatTime(stop.completedAt)}` : '';
  return {
    struck: stop.status === 'CANCELLED',
    summary: `${verb[stop.status]}${who}${when}`,
    reason: stop.status !== 'COMPLETED' && stop.endReason ? `Reason: ${stop.endReason}` : null,
  };
}

/**
 * A corrected performer stays visible: the earlier name, struck through by the caller, then who
 * corrected it, when and why (MASTER.md, "Corrections stay visible"; #307).
 */
export function describePerformerCorrection(
  correction: PerformerCorrection,
  formatTime: (iso: string) => string,
) {
  return {
    previous: correction.previousPerformer,
    summary: `Corrected by ${correction.correctedBy.displayName}, ${formatTime(correction.correctedAt)}`,
    reason: correction.reason ? `Reason: ${correction.reason}` : null,
  };
}

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

/** The clinic's active volunteer directory (#226), suggested in the screener field (#227). */
export const fetchScreenerNames = (clinicId: string, getToken: GetToken) =>
  request<{ items: Array<{ name: string; volunteerContactId: string }> }>(
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

/** "End clinic day": closes everyone still in the line as clinic closed (not left). */
export const closeClinicDay = (clinicId: string, date: string, getToken: GetToken) =>
  request<{ date: string; closed: number }>(
    clinicId,
    `/stations/day/close?date=${encodeURIComponent(date)}`,
    getToken,
    { method: 'POST' },
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

/**
 * How long a patient can be with someone at each kind of station before the line flags it (#424):
 * a measurement takes minutes, review with counselling takes longer.
 */
export const HELD_TOO_LONG_MINUTES: Record<StationKind, number> = {
  INTAKE: 15,
  BLOOD_PRESSURE: 15,
  GLUCOSE: 15,
  ANTHROPOMETRY: 15,
  EYE: 15,
  CUSTOM: 15,
  REVIEW: 30,
};

/**
 * Minutes a taken patient has been held past their station's limit, or null when they are not
 * held too long. Counts from when they were taken, not from when they joined the queue.
 */
export function heldTooLongMinutes(
  visit: Pick<StationVisit, 'status' | 'claimedAt' | 'station'>,
  now: Date = new Date(),
): number | null {
  if (visit.status !== 'IN_PROGRESS' || !visit.claimedAt) return null;
  const minutes = minutesSince(visit.claimedAt, now);
  return minutes > HELD_TOO_LONG_MINUTES[visit.station.kind] ? minutes : null;
}

/** "With Kofi Boateng for 25 min": one wording for a held patient on the board and the queue (#424). */
export const heldLabel = (holder: string, minutes: number) => `With ${holder} for ${minutes} min`;

/** Whole years from a date of birth (YYYY-MM-DD or ISO), or null without one. */
export function ageInYears(dob: string | null, now: Date = new Date()): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const age = now.getUTCFullYear() - y;
  const birthdayPassed =
    now.getUTCMonth() + 1 > m || (now.getUTCMonth() + 1 === m && now.getUTCDate() >= d);
  return birthdayPassed ? age : age - 1;
}

export function patientName(patient: StationVisit['patient']): string {
  return formatPersonName(patient, 'short');
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

/** "Ask a doctor" (#418). Asking again on the same patient raises the one request already open. */
export const requestDoctor = (
  clinicId: string,
  visitId: string,
  body: { urgency: DoctorRequestUrgency; reason?: DoctorRequestReason },
  getToken: GetToken,
) =>
  request<DoctorRequest>(
    clinicId,
    `/station-visits/${encodeURIComponent(visitId)}/doctor-request`,
    getToken,
    { method: 'POST', body },
  );

/** "I'm on it". A 409 with code DOCTOR_REQUEST_TAKEN names who took it first. */
export const claimDoctorRequest = (clinicId: string, requestId: string, getToken: GetToken) =>
  request<DoctorRequest>(
    clinicId,
    `/doctor-requests/${encodeURIComponent(requestId)}/claim`,
    getToken,
    { method: 'POST' },
  );

/** "Seen", by the doctor who took it. */
export const resolveDoctorRequest = (clinicId: string, requestId: string, getToken: GetToken) =>
  request<DoctorRequest>(
    clinicId,
    `/doctor-requests/${encodeURIComponent(requestId)}/resolve`,
    getToken,
    { method: 'POST' },
  );

/** How urgent a patient waiting at review is (#419): lower comes first. */
function reviewRank(visit: StationVisit): number {
  if (visit.doctorRequest?.open && visit.doctorRequest.urgency === 'NOW') return 0;
  const worst = worstLineFlag(visit.lineFlags);
  if (worst === 'REFER_TODAY') return 1;
  if (worst === 'REPEAT_AT_REVIEW') return 2;
  return 3;
}

/**
 * The review station's waiting list (#419): a doctor asked for now, then refer today, then repeat
 * at review, then everyone else oldest first. Without flags or requests it is simply oldest first.
 */
export function sortReviewQueue(visits: readonly StationVisit[]): StationVisit[] {
  return [...visits].sort(
    (a, b) => reviewRank(a) - reviewRank(b) || a.queuedAt.localeCompare(b.queuedAt),
  );
}

const REVIEW_COUNT_POLL_MS = 60_000;

/**
 * Patients waiting at review, for the Stations nav badge (#419). Null unless this person is on
 * shift at the review station. Polls once a minute and on focus, like the notification bell;
 * a failed read keeps the last number.
 */
export function useReviewWaitingCount(
  clinicId: string | null,
  getToken: GetToken | undefined,
  enabled: boolean,
): number | null {
  const [count, setCount] = useState<number | null>(null);
  const active = enabled && Boolean(clinicId && getToken);

  const refresh = useCallback(async () => {
    if (!clinicId || !getToken || document.visibilityState === 'hidden' || !navigator.onLine)
      return;
    try {
      const body = await request<{ count: number | null }>(
        clinicId,
        '/stations/review-waiting/count',
        getToken,
      );
      setCount(body.count);
    } catch {
      // A courtesy number: keep the last one.
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REVIEW_COUNT_POLL_MS);
    const onChange = () => void refresh();
    window.addEventListener('focus', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [active, refresh]);

  return active ? count : null;
}
