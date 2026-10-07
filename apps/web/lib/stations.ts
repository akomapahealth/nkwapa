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
  stations: Array<ClinicStation & { staff: StaffSummary[]; visits: StationVisit[] }>;
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
