/**
 * Research export and schedule views as the API returns them, and the words the UI uses for
 * them (#166). Kept apart from the screens so the wording is testable and shared.
 */

export type ResearchExportStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'SKIPPED';

export type ResearchStorageProvider = 'R2' | 'GITHUB' | 'LOCAL';
export type ResearchCadence = 'WEEKLY' | 'MONTHLY';
export type ResearchScheduleStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED'
  | 'REVOKED';

interface Person {
  id: string;
  displayName: string;
}

export interface ResearchRunChanges {
  runKey: string;
  previousRunKey: string | null;
  consentedSubjects: number;
  previousConsentedSubjects: number | null;
  subjectsAdded: number;
  subjectsRevoked: number;
  subjectsOtherwiseRemoved: number;
  rowCountDeltas: Record<string, number>;
}

export interface ResearchExportItem {
  id: string;
  clinicId: string;
  runKey: string;
  trigger: 'MANUAL' | 'SCHEDULED';
  scheduleId: string | null;
  status: ResearchExportStatus;
  fromDate: string;
  toDate: string;
  datasetVersion: number;
  policyVersionSnapshot: string;
  rejectionReason: string | null;
  failureReason: string | null;
  skipReason: string | null;
  filePath: string | null;
  fileFormat: string | null;
  recordCount: number | null;
  rowCounts: Record<string, number>;
  consentedSubjectCount: number | null;
  revokedSinceLastCount: number | null;
  contentSha256: string | null;
  changes: ResearchRunChanges | null;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  storageProvider: ResearchStorageProvider | null;
  storagePath: string | null;
  storageRef: string | null;
  storageUrl: string | null;
  requestedAt: string;
  startedAt: string | null;
  approvedAt: string | null;
  syncedAt: string | null;
  completedAt: string | null;
  requestedBy?: Person;
  approvedBy?: Person | null;
}

export interface ResearchSchedule {
  id: string;
  clinicId: string;
  cadence: ResearchCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  localHour: number;
  timezone: string;
  coverageStartDate: string;
  destination: ResearchStorageProvider;
  status: ResearchScheduleStatus;
  statusReason: string | null;
  reviewBy: string | null;
  createdBy: Person;
  approvedBy: Person | null;
  approvedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRun: ResearchExportItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchScheduleList {
  items: ResearchSchedule[];
  researchEnabled: boolean;
  approvalRequired: boolean;
  destinations: ResearchStorageProvider[];
  defaultDestination: ResearchStorageProvider;
  timezone: string;
  minSubjects: number;
  defaultReviewMonths: number;
}

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const DESTINATION_LABELS: Record<ResearchStorageProvider, string> = {
  R2: 'Cloudflare R2',
  GITHUB: 'Private GitHub repo',
  LOCAL: 'Server disk (development)',
};

export const SCHEDULE_STATUS_LABELS: Record<ResearchScheduleStatus, string> = {
  PENDING_APPROVAL: 'Waiting for approval',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  EXPIRED: 'Review due',
  REVOKED: 'Revoked',
};

/** The same reasons the director's email gives, so the page and the inbox agree. */
const SKIP_REASONS: Record<string, string> = {
  RESEARCH_DISABLED: 'Research is turned off for the clinic.',
  SCHEDULE_INACTIVE: 'The schedule is paused, revoked or waiting for approval.',
  REVIEW_EXPIRED: 'The schedule is past its review date and needs a director to approve it again.',
  APPROVER_LOST_PERMISSION: 'The director who approved the schedule can no longer approve exports.',
  BELOW_MINIMUM_COHORT:
    'Too few patients have consented to research for a run to be published safely.',
};

export function skipReasonLabel(reason: string | null): string {
  return (reason && SKIP_REASONS[reason]) || 'The run was skipped.';
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "Monthly, on the 1st at 03:00 Africa/Accra". */
export function describeCadence(
  schedule: Pick<ResearchSchedule, 'cadence' | 'dayOfWeek' | 'dayOfMonth' | 'localHour'>,
  timezone: string,
): string {
  const hour = `${String(schedule.localHour).padStart(2, '0')}:00 ${timezone}`;
  if (schedule.cadence === 'WEEKLY') {
    const day = WEEKDAYS[(schedule.dayOfWeek ?? 1) - 1];
    return `Weekly, on ${day} at ${hour}`;
  }
  return `Monthly, on the ${ordinal(schedule.dayOfMonth ?? 1)} at ${hour}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One sentence a director can read: who joined and who left since the previous run. */
export function describeChanges(changes: ResearchRunChanges | null): string | null {
  if (!changes) return null;
  if (!changes.previousRunKey) {
    return `First run: ${plural(changes.consentedSubjects, 'consented patient')}.`;
  }
  const parts = [`${changes.subjectsAdded} added`, `${changes.subjectsRevoked} revoked`];
  if (changes.subjectsOtherwiseRemoved > 0) {
    parts.push(`${changes.subjectsOtherwiseRemoved} merged or removed`);
  }
  return `${plural(changes.consentedSubjects, 'consented patient')} since ${changes.previousRunKey}: ${parts.join(', ')}.`;
}

export function formatBytes(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
