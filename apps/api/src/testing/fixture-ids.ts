/**
 * The synthetic identifiers every fixture module in this directory builds on.
 *
 * One clinic, one patient, one actor, named once. The appointment and identity fixture modules
 * both re-export these, so a suite that spans the two workflows -- a merge that moves
 * appointments, say -- is talking about one clinic in both halves rather than two that happen to
 * share a string.
 *
 * Every value here is synthetic. No real patient data belongs in this file or in any fixture
 * derived from it.
 */

export const FIXTURE_CLINIC_ID = 'clinic-1';
export const FIXTURE_OTHER_CLINIC_ID = 'clinic-2';
export const FIXTURE_PATIENT_ID = 'patient-1';
export const FIXTURE_APPOINTMENT_ID = 'appointment-1';
export const FIXTURE_REQUEST_ID = 'appt-req-1';
export const FIXTURE_ACTOR_ID = 'manager-1';
