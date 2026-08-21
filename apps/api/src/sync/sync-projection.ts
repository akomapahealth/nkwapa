import { Prisma } from '@prisma/client';

/**
 * The patient fields the offline client receives.
 *
 * `GET /sync/pull` previously returned whole Prisma rows, so every column a migration added was
 * shipped to every browser and written to IndexedDB automatically. That put the encrypted national
 * id and its hash on every clinician's device even though nothing on the client can decrypt one or
 * ever read the other.
 *
 * Listing the fields explicitly makes the decision to send something deliberate, and makes a new
 * column opt-in rather than opt-out.
 */
export const SYNC_PATIENT_SELECT = {
  id: true,
  patientCode: true,
  primaryClinicId: true,
  firstName: true,
  lastName: true,
  dob: true,
  sex: true,
  phoneE164: true,
  email: true,
  nationalIdType: true,
  // Shown when confirming a patient's identity. The ciphertext and hash are not sent.
  nationalIdLast4: true,
  residentialLocationStatus: true,
  residentialRegion: true,
  residentialDistrict: true,
  residentialCommunity: true,
  residentialAddressNote: true,
  mergedIntoPatientId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PatientSelect;

/**
 * Patient columns deliberately withheld from the offline client, and why.
 *
 * A column named here must not appear in SYNC_PATIENT_SELECT; a column in neither is a decision
 * nobody has made yet, which sync-projection.spec.ts reports as a failure.
 */
export const SYNC_PATIENT_WITHHELD: Record<string, string> = {
  nationalIdCiphertext:
    'Only the server holds the decryption key, so the ciphertext is unreadable on the device and is pure exposure if it is stolen.',
  nationalIdHash:
    'Duplicate detection happens server-side; the hash was stored and indexed offline without ever being read.',
  portalUserId:
    'Links a chart to a portal account. Offline capture never needs it, and it associates a patient with a login.',
  mergedAt:
    'Merge provenance is an administrative record reviewed online; pull already excludes merged patients.',
  mergedByUserId:
    'Merge provenance is an administrative record reviewed online; pull already excludes merged patients.',
};

export type SyncPatientProjection = Prisma.PatientGetPayload<{
  select: typeof SYNC_PATIENT_SELECT;
}>;
