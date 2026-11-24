/** "Ask a doctor" from a station (#418): what the web shows. Calls live in lib/stations.ts. */
export type DoctorRequestUrgency = 'NOW' | 'BEFORE_LEAVING';
export type DoctorRequestReason = 'HIGH_BP' | 'HIGH_GLUCOSE' | 'SYMPTOMS' | 'MEDICATION' | 'OTHER';

export interface DoctorRequest {
  id: string;
  urgency: DoctorRequestUrgency;
  reason: DoctorRequestReason | null;
  /** Raised by a refer-today reading, not by a person. */
  auto: boolean;
  stationVisitId: string | null;
  claimedBy: { id: string; displayName: string } | null;
  claimedAt: string | null;
  /** Unresolved and the patient still on the line. */
  open: boolean;
}

export const DOCTOR_REQUEST_URGENCIES: ReadonlyArray<{
  value: DoctorRequestUrgency;
  label: string;
  description: string;
}> = [
  { value: 'NOW', label: 'Now', description: 'A doctor should come to this station.' },
  {
    value: 'BEFORE_LEAVING',
    label: 'Before they leave',
    description: 'A doctor should see them before they go home.',
  },
];

export const DOCTOR_REQUEST_REASONS: ReadonlyArray<{ value: DoctorRequestReason; label: string }> =
  [
    { value: 'HIGH_BP', label: 'High BP' },
    { value: 'HIGH_GLUCOSE', label: 'High glucose' },
    { value: 'SYMPTOMS', label: 'Symptoms' },
    { value: 'MEDICATION', label: 'Medication question' },
    { value: 'OTHER', label: 'Other' },
  ];

/** "Doctor requested" until someone takes it, then "Dr Mensah on it" or "You're on it". */
export function doctorRequestLabel(request: DoctorRequest, me?: string | null): string {
  if (!request.claimedBy)
    return request.urgency === 'NOW' ? 'Doctor needed now' : 'Doctor requested';
  return request.claimedBy.id === me ? "You're on it" : `${request.claimedBy.displayName} on it`;
}
