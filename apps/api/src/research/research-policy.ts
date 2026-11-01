import { createHash } from 'crypto';
import type { ResearchExportTrigger } from '@prisma/client';

export const RESEARCH_EXPORT_QUEUE_NAME = 'research-exports';
export const RESEARCH_POLICY_VERSION = 'research-export-v1';
// v4 adds a coarse residential_region column to research_subjects.csv.
// v5 realises the guided chronic interviews (#114): forty hypertension columns on
// research_clinical_screenings.csv, which carried three, and a new
// research_medication_adherence.csv. Consumers pinned to v4 keep every column they had -- the
// change is additive, and the new file is the only one that has to be read for the first time.
export const RESEARCH_DATASET_VERSION = 5;
export const RESEARCH_TIMESTAMP_ROUNDING_MINUTES = 15;
export const RESEARCH_FILE_FORMAT = 'zip';

export const RESEARCH_TABLE_NAMES = [
  'research_subjects.csv',
  'research_ops_checkins.csv',
  'research_ops_assignments.csv',
  'research_clinical_vitals.csv',
  'research_clinical_tobacco.csv',
  'research_clinical_screenings.csv',
  'research_medication_adherence.csv',
  'research_measurements.csv',
  'research_appointments.csv',
  'research_medical_history.csv',
  'research_revocations.csv',
] as const;

export type ResearchTableName = (typeof RESEARCH_TABLE_NAMES)[number];

export interface ResearchPackFile {
  name: string;
  content: string;
  bytes: number;
  sha256: string;
}

export interface ResearchManifestFileSummary {
  name: string;
  bytes: number;
  sha256: string;
  rows?: number;
}

/** Who a run is, as recorded in its manifest (#166). */
export interface ResearchRunIdentity {
  runKey: string;
  trigger: ResearchExportTrigger;
  scheduleId: string | null;
}

/**
 * What changed since the previous completed run, written as `changes.json` (#166).
 *
 * Derived from the database rather than by diffing stored files: added subjects are consents
 * granted since that run, revoked ones are the revocation rows, and anything else that left the
 * cohort (a merged or deleted chart) is the remainder.
 */
export interface ResearchRunChanges {
  runKey: string;
  previousRunKey: string | null;
  consentedSubjects: number;
  /** Null for the first run, or after a run that predates subject counts. */
  previousConsentedSubjects: number | null;
  subjectsAdded: number;
  subjectsRevoked: number;
  subjectsOtherwiseRemoved: number;
  rowCountDeltas: Record<string, number>;
}

export interface ResearchPackManifest {
  exportId: string;
  runKey: string;
  trigger: ResearchExportTrigger;
  scheduleId: string | null;
  previousRunKey: string | null;
  clinicKey: string;
  /** Keys made under different HMAC key ids do not join. */
  hmacKeyId: string;
  consentedSubjects: number;
  revokedSinceLast: number;
  /** sha256 over the table lines of SHA256SUMS.txt: equal for two runs with identical data. */
  contentSha256: string;
  datasetVersion: number;
  policyVersion: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  timestampRoundingMinutes: number;
  rowCounts: Record<string, number>;
  files: ResearchManifestFileSummary[];
}

export interface GeneratedResearchPack {
  manifest: ResearchPackManifest;
  changes: ResearchRunChanges;
  repoFiles: ResearchPackFile[];
  artifactPath: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  recordCount: number;
  rowCounts: Record<string, number>;
}

export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}
