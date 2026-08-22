/**
 * Migration boundaries the test suites reason about.
 *
 * Kept out of any spec file so a suite that needs one does not have to import another suite to
 * get it, which would run that suite's tests as a side effect.
 */

/** The last migration before the clinical-records initiative begins. */
export const PRE_CLINICAL_RECORDS_WATERMARK = '20260615110000_appointment_reminder_lifecycle';

/** The first migration of the clinical-records initiative. */
export const FIRST_CLINICAL_RECORDS_MIGRATION = '20260731000000_add_medical_history';
