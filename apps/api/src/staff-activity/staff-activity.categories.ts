/**
 * What a member of staff's audit trail says they did, grouped by workflow (#33).
 *
 * Staff activity is a summary of the audit trail, which is why it is read under the same
 * permission (`AUDIT.READ`): it shows nothing a manager could not already read event by event.
 * Each category counts the distinct records a person touched, not events, so a form saved five
 * times is one screening, not five.
 *
 * An action missing from this list is simply not counted. Read-only events (a duplicate review
 * opened, a chart viewed) are deliberately absent: this is workload, not surveillance.
 */
export const STAFF_ACTIVITY_CATEGORIES = [
  { key: 'patientsRegistered', label: 'Patients registered', actions: ['PATIENT.CREATE'] },
  { key: 'visitsStarted', label: 'Visits started', actions: ['ENCOUNTER.CREATE'] },
  {
    key: 'screeningRecords',
    label: 'Screening records',
    actions: [
      'VITALS.CREATE',
      'VITALS.UPSERT',
      'TOBACCO_SCREENING.CREATE',
      'TOBACCO_SCREENING.UPSERT',
      'HYPERTENSION_ASSESSMENT.CREATE',
      'HYPERTENSION_ASSESSMENT.UPSERT',
      'DIABETES_SCREENING.CREATE',
      'DIABETES_SCREENING.UPSERT',
      'DIABETES_SCREENING.GLUCOSE_READING',
      'MEDICAL_HISTORY.CREATE',
      'MEDICAL_HISTORY.REVISE',
      'MEDICATION_ADHERENCE.CREATE',
      'MEDICATION_ADHERENCE.UPSERT',
      'EYE_SCREENING.CREATE',
      'EYE_SCREENING.UPDATE',
      'COUNSELLING.CREATE',
      'COUNSELLING.UPDATE',
    ],
  },
  { key: 'stationPatientsTaken', label: 'Patients taken at a station', actions: ['STATION.CLAIM'] },
  { key: 'stationHandOns', label: 'Patients handed on', actions: ['STATION.COMPLETE'] },
  { key: 'submittedForReview', label: 'Sent for review', actions: ['ENCOUNTER.SUBMIT_FOR_REVIEW'] },
  { key: 'reviews', label: 'Reviews', actions: ['ENCOUNTER.REVIEW', 'TOBACCO_SCREENING.REVIEW'] },
  { key: 'finalized', label: 'Visits finalized', actions: ['ENCOUNTER.FINALIZE'] },
  {
    key: 'clinicianDecisions',
    label: 'Plans, notes and prescriptions',
    actions: [
      'HYPERTENSION_ASSESSMENT.CLINICIAN_PLAN',
      'DIABETES_SCREENING.CLINICIAN_PLAN',
      'CLINICAL_NOTE.AUTHOR_SIGN',
      'CLINICAL_NOTE.COSIGN',
      'CLINICAL_NOTE.ADDENDUM',
      'PRESCRIPTION.CREATE',
    ],
  },
  {
    key: 'followUpsScheduled',
    label: 'Follow-ups scheduled',
    actions: ['REMINDER.CREATE', 'APPT.CREATE', 'APPT.REQUEST.CONFIRM'],
  },
] as const;

export type StaffActivityCategory = (typeof STAFF_ACTIVITY_CATEGORIES)[number]['key'];
export type StaffActivityCounts = Record<StaffActivityCategory, number>;

export const COUNTED_ACTIONS: readonly string[] = STAFF_ACTIVITY_CATEGORIES.flatMap((category) => [
  ...category.actions,
]);

const CATEGORY_BY_ACTION = new Map<string, StaffActivityCategory>(
  STAFF_ACTIVITY_CATEGORIES.flatMap((category) =>
    category.actions.map((action) => [action, category.key] as const),
  ),
);

export function categoryOf(action: string): StaffActivityCategory | null {
  return CATEGORY_BY_ACTION.get(action) ?? null;
}

export function emptyCounts(): StaffActivityCounts {
  return Object.fromEntries(
    STAFF_ACTIVITY_CATEGORIES.map((category) => [category.key, 0]),
  ) as StaffActivityCounts;
}

/** Where a touched record can be opened from, for the entity types that have a page. */
export function recordHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'Encounter':
      return `/encounters/${entityId}`;
    case 'PatientStationVisit':
      return `/stations/visits/${entityId}`;
    default:
      return null;
  }
}

/**
 * Hours on shift inside [from, to]. An open shift counts up to `now`, never past the window.
 */
export function shiftHoursInWindow(
  shifts: ReadonlyArray<{ checkedInAt: Date; checkedOutAt: Date | null }>,
  window: { from: Date; to: Date },
  now: Date,
): number {
  const ms = shifts.reduce((sum, shift) => {
    const start = Math.max(shift.checkedInAt.getTime(), window.from.getTime());
    const end = Math.min((shift.checkedOutAt ?? now).getTime(), window.to.getTime(), now.getTime());
    return sum + Math.max(0, end - start);
  }, 0);
  return Math.round((ms / 3_600_000) * 10) / 10;
}
