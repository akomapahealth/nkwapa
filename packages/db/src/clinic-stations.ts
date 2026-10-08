/**
 * The station line every clinic starts with (#167), as the UCC student clinic runs it.
 *
 * The migration that introduced stations seeds existing clinics with these rows in SQL; new
 * clinics get them from ClinicService. Keep the two in step.
 */
export type StationKindValue =
  | 'INTAKE'
  | 'BLOOD_PRESSURE'
  | 'GLUCOSE'
  | 'ANTHROPOMETRY'
  | 'EYE'
  | 'REVIEW'
  | 'CUSTOM';

export const DEFAULT_CLINIC_STATIONS: ReadonlyArray<{
  kind: StationKindValue;
  name: string;
  sortOrder: number;
}> = [
  { kind: 'INTAKE', name: 'Registration and medical history', sortOrder: 1 },
  { kind: 'BLOOD_PRESSURE', name: 'Blood pressure', sortOrder: 2 },
  { kind: 'GLUCOSE', name: 'Glucose testing', sortOrder: 3 },
  { kind: 'ANTHROPOMETRY', name: 'Anthropometry', sortOrder: 4 },
  { kind: 'EYE', name: 'Eye station', sortOrder: 5 },
  { kind: 'REVIEW', name: 'Counselling and clinical review', sortOrder: 6 },
];

export const STATION_KIND_LABELS: Record<StationKindValue, string> = {
  INTAKE: 'Registration and history',
  BLOOD_PRESSURE: 'Blood pressure',
  GLUCOSE: 'Glucose',
  ANTHROPOMETRY: 'Anthropometry',
  EYE: 'Eye',
  REVIEW: 'Counselling and review',
  CUSTOM: 'Other',
};

/**
 * Where a patient goes after a station: the next active station by order, or null after the
 * review station, which ends the session. Stations the volunteer chose to skip are passed over.
 */
export function nextStationId(
  stations: ReadonlyArray<{
    id: string;
    kind: StationKindValue;
    sortOrder: number;
    active: boolean;
  }>,
  currentStationId: string,
  skip: ReadonlySet<string> = new Set(),
): string | null {
  const ordered = stations.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const current = stations.find((s) => s.id === currentStationId);
  if (!current || current.kind === 'REVIEW') return null;
  const after = ordered.filter((s) => s.sortOrder > current.sortOrder && !skip.has(s.id));
  if (after.length) return after[0].id;
  // Past the last station but never reviewed: the review station closes every session.
  const review = ordered.find((s) => s.kind === 'REVIEW');
  return review && review.id !== currentStationId ? review.id : null;
}
