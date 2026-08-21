/**
 * Patient chart information architecture.
 *
 * This module is the single source of truth for which sections the patient chart has and
 * who may see each one. Both the API and the web app import it, so the tab list the client
 * renders can never drift from the access policy the server enforces.
 *
 * Permission strings intentionally mirror `apps/api/src/auth/constants/permissions.ts`.
 * That file remains the authority for role -> permission; this file only maps
 * permission -> chart section.
 */

export const PATIENT_CHART_SECTION_IDS = [
  'overview',
  'vitals',
  'medications',
  'diabetes',
  'medical-history',
  'notes',
  'visits',
  'self-reports',
  'consent',
] as const;

export type PatientChartSectionId = (typeof PATIENT_CHART_SECTION_IDS)[number];

/** Feature flags gating a chart section, keyed as both apps' flag readers key them. */
export type PatientChartFeatureFlag =
  | 'medicalHistory'
  | 'medicationReconciliation'
  | 'clinicalNotes';

export interface PatientChartSection {
  id: PatientChartSectionId;
  /** Accessible tab name. Also the string end-to-end tests select on. */
  label: string;
  /** Shown as supporting copy on empty and no-access states. */
  description: string;
  requiredPermission: string;
  featureFlag?: PatientChartFeatureFlag;
}

/**
 * Ordered so current, high-value summaries come before chronological history.
 * `notes` resolves to DOCTOR and VOLUNTEER only, because `CLINICAL_NOTE.READ` is granted
 * to exactly those two roles (plus the system-admin wildcard).
 */
export const PATIENT_CHART_SECTIONS: readonly PatientChartSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Current summaries and pending clinical actions for this patient.',
    requiredPermission: 'PATIENT.READ',
  },
  {
    id: 'vitals',
    label: 'Vitals',
    description: 'Latest measurements, trends, and the chronological vitals record.',
    requiredPermission: 'ENCOUNTER.READ',
  },
  {
    id: 'medications',
    label: 'Medications',
    description: 'Patient-reported medications, reconciliation, and pharmacy history.',
    requiredPermission: 'MEDICATION_RECONCILIATION.READ',
    featureFlag: 'medicationReconciliation',
  },
  {
    id: 'diabetes',
    label: 'Diabetes',
    description: 'Glucose and HbA1c screening history with suspicion status.',
    requiredPermission: 'SCREENING.READ',
  },
  {
    id: 'medical-history',
    label: 'Medical History',
    description: 'Longitudinal conditions, allergies, surgeries, and family history.',
    requiredPermission: 'MEDICAL_HISTORY.READ',
    featureFlag: 'medicalHistory',
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'History, assessment, and plan notes with cosign and addendum history.',
    requiredPermission: 'CLINICAL_NOTE.READ',
    featureFlag: 'clinicalNotes',
  },
  {
    id: 'visits',
    label: 'Visits',
    description: 'Every encounter for this patient with what was recorded at each one.',
    requiredPermission: 'ENCOUNTER.READ',
  },
  {
    id: 'self-reports',
    label: 'Patient-reported',
    description: 'Readings and updates submitted by the patient through the portal.',
    requiredPermission: 'PATIENT.SELF_REPORT.READ',
  },
  {
    id: 'consent',
    label: 'Consent',
    description: 'De-identified research consent status and history.',
    requiredPermission: 'CONSENT.RECORD',
  },
];

const SECTIONS_BY_ID = new Map<string, PatientChartSection>(
  PATIENT_CHART_SECTIONS.map((section) => [section.id, section]),
);

export function isPatientChartSectionId(value: unknown): value is PatientChartSectionId {
  return typeof value === 'string' && SECTIONS_BY_ID.has(value);
}

export function getPatientChartSection(id: PatientChartSectionId): PatientChartSection {
  const section = SECTIONS_BY_ID.get(id);
  // Unreachable for a valid id; keeps the return type non-optional for callers.
  if (!section) throw new Error(`Unknown patient chart section: ${id}`);
  return section;
}

export interface PatientChartAccessInput {
  /** Effective permissions for the active clinic. `'*'` grants everything. */
  permissions: readonly string[];
  /** Feature flags currently enabled in this environment. */
  enabledFeatureFlags: readonly PatientChartFeatureFlag[];
}

function hasChartPermission(permissions: readonly string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required);
}

/**
 * The sections a caller may read, in display order.
 *
 * The API uses this to decide what to serve and to build the `sections` contract; the web
 * app uses the same call to decide what to render. A section absent here must never have
 * its payload returned to the caller.
 */
export function resolveAccessiblePatientChartSections(
  input: PatientChartAccessInput,
): PatientChartSection[] {
  return PATIENT_CHART_SECTIONS.filter((section) => {
    if (section.featureFlag && !input.enabledFeatureFlags.includes(section.featureFlag)) {
      return false;
    }
    return hasChartPermission(input.permissions, section.requiredPermission);
  });
}

export function canAccessPatientChartSection(
  id: PatientChartSectionId,
  input: PatientChartAccessInput,
): boolean {
  return resolveAccessiblePatientChartSections(input).some((section) => section.id === id);
}

/**
 * Resolves a `?tab=` value against what the caller may actually see.
 * Unknown or unauthorised values fall back to the first accessible section rather than
 * rendering an empty chart.
 */
export function resolvePatientChartSectionId(
  requested: string | null | undefined,
  accessible: readonly PatientChartSection[],
): PatientChartSectionId | null {
  if (accessible.length === 0) return null;
  if (isPatientChartSectionId(requested)) {
    const match = accessible.find((section) => section.id === requested);
    if (match) return match.id;
  }
  return accessible[0].id;
}
