/**
 * Reading today's vitals for the chronic-disease interviews.
 *
 * The interviews display today's blood pressure, pulse and anthropometrics but never store them.
 * `Vitals` is the one place a measurement lives, so an encounter cannot end up holding two
 * disagreeing answers to "what was the blood pressure today", and correcting a mistyped vital
 * corrects the classification derived from it with no second edit.
 *
 * The freshness rule below exists because of an ordering hazard on the encounter page:
 * `handleTabChange` awaits the outgoing tab's save, but the `onSaved` -> `fetchData()` that
 * follows is not awaited by the tab switch. A volunteer who edits vitals and immediately moves to
 * Hypertension can therefore arrive before the page prop has caught up, and would read the
 * previous values.
 */

export interface EncounterVitalsReading {
  systolicBp: number | null;
  diastolicBp: number | null;
  pulseBpm: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  updatedAt?: string;
}

function isFresher(candidate?: string, incumbent?: string): boolean {
  if (!candidate) return false;
  if (!incumbent) return true;
  const a = Date.parse(candidate);
  const b = Date.parse(incumbent);
  if (!Number.isFinite(a)) return false;
  if (!Number.isFinite(b)) return true;
  return a > b;
}

/**
 * Pick whichever of the page's prop and the local cache was written last.
 *
 * Neither source is reliably ahead. The prop leads after a server fetch; the local record leads
 * immediately after an offline save. Comparing `updatedAt` is the only thing that answers it
 * without the interview having to know which happened.
 */
export function freshestVitals(
  fromPage: EncounterVitalsReading | null | undefined,
  fromCache: EncounterVitalsReading | null | undefined,
): EncounterVitalsReading | null {
  if (!fromPage) return fromCache ?? null;
  if (!fromCache) return fromPage;
  return isFresher(fromCache.updatedAt, fromPage.updatedAt) ? fromCache : fromPage;
}

/** Whether a reading carries a complete blood pressure. Half a reading is not one. */
export function hasBloodPressure(reading: EncounterVitalsReading | null): boolean {
  return reading?.systolicBp != null && reading?.diastolicBp != null;
}

/**
 * Render a reading the way a clinician says it, units attached.
 *
 * MASTER.md section 10 puts units in the label rather than a placeholder, but this is read-only
 * display rather than an input, so the unit rides with the value.
 */
export function formatBloodPressure(reading: EncounterVitalsReading | null): string {
  if (!hasBloodPressure(reading)) return 'Not recorded';
  return `${reading!.systolicBp}/${reading!.diastolicBp} mmHg`;
}

export function formatPulse(reading: EncounterVitalsReading | null): string {
  return reading?.pulseBpm == null ? 'Not recorded' : `${reading.pulseBpm} bpm`;
}
