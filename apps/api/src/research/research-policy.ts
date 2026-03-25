import { createHash } from "crypto";

export const RESEARCH_EXPORT_QUEUE_NAME = "research-exports";
export const RESEARCH_POLICY_VERSION = "research-export-v1";
export const RESEARCH_DATASET_VERSION = 1;
export const RESEARCH_TIMESTAMP_ROUNDING_MINUTES = 15;
export const RESEARCH_FILE_FORMAT = "zip";

export const RESEARCH_TABLE_NAMES = [
  "research_subjects.csv",
  "research_ops_checkins.csv",
  "research_ops_assignments.csv",
  "research_clinical_vitals.csv",
  "research_clinical_screenings.csv",
  "research_measurements.csv",
  "research_appointments.csv",
  "research_revocations.csv",
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

export interface ResearchPackManifest {
  exportId: string;
  clinicKey: string;
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
  repoFiles: ResearchPackFile[];
  artifactPath: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  recordCount: number;
  rowCounts: Record<string, number>;
}

export interface ResearchRepoSyncResult {
  provider: string;
  repoPath: string;
  commitSha: string;
  commitUrl: string;
  syncedAt: Date;
}

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

