import {
  resolveAccessiblePatientChartSections,
  resolvePatientChartSectionId,
  type PatientChartFeatureFlag,
  type PatientChartSection,
  type PatientChartSectionId,
} from '@nkwapa/db';
import { apiFetch, readApiError, type GetToken } from './api';
import { isWebFeatureEnabled } from './feature-flags';

export type {
  PatientChartSection,
  PatientChartSectionId,
  PatientChartFeatureFlag,
} from '@nkwapa/db';

export type EncounterStatus = 'DRAFT' | 'IN_REVIEW' | 'FINALIZED';

export interface ChartPerson {
  id: string;
  displayName: string;
}

export interface ChartClinicRef {
  id: string;
  name: string;
}

/** Provenance every longitudinal record carries: when, by whom, where, from which visit. */
export interface ChartRecordSource {
  encounterId: string;
  encounterStatus: EncounterStatus;
  encounterCreatedAt: string;
  recordedBy: ChartPerson | null;
  clinic: ChartClinicRef;
  locked: boolean;
}

export interface ChartVitalsRecord extends ChartRecordSource {
  id: string;
  recordedAt: string;
  updatedAt: string;
  systolicBp: number | null;
  diastolicBp: number | null;
  pulseBpm: number | null;
  temperatureCelsius: number | null;
  respiratoryRate: number | null;
  spo2Percent: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  notes: string | null;
}

export interface ChartVisitRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: EncounterStatus;
  locked: boolean;
  createdBy: ChartPerson | null;
  reviewedBy: ChartPerson | null;
  finalizedBy: ChartPerson | null;
  clinic: ChartClinicRef;
  recorded: {
    vitals: boolean;
    diabetesScreening: boolean;
    tobaccoScreening: boolean;
    hypertensionAssessment: boolean;
    carePlan: boolean;
    prescriptions: number;
    /** Absent for roles without clinical-note status access. */
    noteStatus?: string | null;
  };
}

export interface ChartPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type ChartPendingActionKind =
  | 'OPEN_VISIT'
  | 'AWAITING_REVIEW'
  | 'NOTE_PENDING_COSIGN'
  | 'ALLERGIES_NOT_RECORDED'
  | 'MEDICATIONS_NOT_RECORDED'
  | 'RESEARCH_CONSENT_NOT_RECORDED';

export interface ChartPendingAction {
  kind: ChartPendingActionKind;
  label: string;
  description: string;
  section: PatientChartSectionId;
  encounterId: string | null;
  count: number;
}

export interface ChartAllergySummary {
  state: 'ACTIVE_ALLERGIES' | 'NO_KNOWN_ALLERGIES' | 'HISTORICAL_ONLY' | 'NOT_RECORDED';
  activeAllergies: Array<{
    recordId: string;
    substance?: string | null;
    reaction?: string | null;
    severity?: string | null;
  }>;
  updatedAt: string | null;
}

export interface PatientChartSummary {
  patientId: string;
  clinicId: string;
  sections: Array<{ id: PatientChartSectionId; label: string; description: string }>;
  vitals: { latest: ChartVitalsRecord | null } | null;
  diabetes: {
    latest:
      | (ChartRecordSource & {
          id: string;
          collectedAt: string;
          glucoseMgDl: number | null;
          glucoseType: string;
          hba1cPercent: number | null;
          symptoms: string[];
          notes: string | null;
        })
      | null;
  } | null;
  allergies: ChartAllergySummary | null;
  medications: {
    currentCount: number;
    noKnownCurrentMedications: boolean;
    lastReconciledAt: string | null;
  } | null;
  noteActivity: { pendingCosign: number; total: number } | null;
  visits: { total: number; open: number; lastVisitAt: string | null } | null;
  consent: { status: string | null; grantedAt: string | null; revokedAt: string | null } | null;
  pendingActions: ChartPendingAction[];
}

/** Query key used for the chart's deep links. */
export const CHART_TAB_PARAM = 'tab';

export function enabledChartFeatureFlags(): PatientChartFeatureFlag[] {
  const flags: PatientChartFeatureFlag[] = [];
  if (isWebFeatureEnabled('medicalHistory')) flags.push('medicalHistory');
  if (isWebFeatureEnabled('medicationReconciliation')) flags.push('medicationReconciliation');
  if (isWebFeatureEnabled('clinicalNotes')) flags.push('clinicalNotes');
  return flags;
}

/**
 * Sections this user may open, from the same registry the API authorizes against.
 * Rendering from this list avoids a flash of tabs the server would refuse.
 */
export function getAccessibleChartSections(permissions: readonly string[]): PatientChartSection[] {
  return resolveAccessiblePatientChartSections({
    permissions,
    enabledFeatureFlags: enabledChartFeatureFlags(),
  });
}

/**
 * Narrows the locally-computed section list to what the server actually served.
 * The server is authoritative; this only ever removes sections, never adds them.
 */
export function reconcileChartSections(
  local: readonly PatientChartSection[],
  serverSectionIds: readonly PatientChartSectionId[] | null | undefined,
): PatientChartSection[] {
  if (!serverSectionIds) return [...local];
  const allowed = new Set<string>(serverSectionIds);
  return local.filter((section) => allowed.has(section.id));
}

export function resolveChartTab(
  requested: string | null | undefined,
  accessible: readonly PatientChartSection[],
): PatientChartSectionId | null {
  return resolvePatientChartSectionId(requested, accessible);
}

/** Stable deep link for a chart section, preserving clinic context in the path. */
export function buildChartHref(
  clinicId: string,
  patientId: string,
  tab?: PatientChartSectionId | null,
): string {
  const base = `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}`;
  return tab ? `${base}?${CHART_TAB_PARAM}=${encodeURIComponent(tab)}` : base;
}

export function buildEncounterHref(clinicId: string, encounterId: string): string {
  return `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}`;
}

function chartPath(clinicId: string, patientId: string, segment: string): string {
  return `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(
    patientId,
  )}/chart/${segment}`;
}

async function getJson<T>(path: string, clinicId: string, getToken: GetToken): Promise<T> {
  const response = await apiFetch(path, { getToken, activeClinicId: clinicId });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as T;
}

export function fetchPatientChartSummary(
  clinicId: string,
  patientId: string,
  getToken: GetToken,
): Promise<PatientChartSummary> {
  return getJson<PatientChartSummary>(
    chartPath(clinicId, patientId, 'summary'),
    clinicId,
    getToken,
  );
}

function withCursor(path: string, cursor: string | null, limit?: number): string {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function fetchPatientChartVitals(
  clinicId: string,
  patientId: string,
  getToken: GetToken,
  cursor: string | null = null,
  limit?: number,
): Promise<ChartPage<ChartVitalsRecord>> {
  return getJson<ChartPage<ChartVitalsRecord>>(
    withCursor(chartPath(clinicId, patientId, 'vitals'), cursor, limit),
    clinicId,
    getToken,
  );
}

export function fetchPatientChartVisits(
  clinicId: string,
  patientId: string,
  getToken: GetToken,
  cursor: string | null = null,
  limit?: number,
): Promise<ChartPage<ChartVisitRecord>> {
  return getJson<ChartPage<ChartVisitRecord>>(
    withCursor(chartPath(clinicId, patientId, 'visits'), cursor, limit),
    clinicId,
    getToken,
  );
}
