/**
 * When a form should take its values from the record it is editing.
 *
 * This lives apart from `use-seeded-form-values.ts` because that module is a React hook, and the
 * rule below is worth pinning with a plain test: both ways of getting it wrong are silent.
 *
 * Never seeding means a form that mounts before its record has loaded shows an empty interview
 * forever and saves emptiness over a real one -- issue #91 in its original form. Seeding every
 * time means the encounter page's `onSaved={fetchData}` refetch, which hands the form a fresh
 * object for the same record, resets every answer entered while it was in flight. That one is
 * worse, because the form still reports the save succeeded: it is how an offline diabetes edit
 * came to replay the previous answers.
 *
 * So: seed once per record, keyed on the identity the caller states rather than on the object's.
 */
export function shouldSeedFormValues({
  hasRecord,
  recordId,
  hasSeeded,
  seededRecordId,
}: {
  /** False while the record is still loading. There is nothing to seed from yet. */
  hasRecord: boolean;
  recordId: string | null | undefined;
  hasSeeded: boolean;
  seededRecordId: string | null | undefined;
}): boolean {
  if (!hasRecord) return false;
  if (!hasSeeded) return true;
  return recordId !== seededRecordId;
}

/**
 * The values a form should hold once a record seeds it, given what the user has done meanwhile.
 *
 * Seeding once per record was not enough on a new encounter. The form mounts with no record, so
 * its first seed arrives with the refetch that follows the first save -- and by then the clinician
 * may already be typing the next change. Replacing the values outright threw that typing away, and
 * the next save, online or queued offline, sent the previous answers while reporting success.
 *
 * So a field the user changed since the last seed keeps what they typed, and every other field
 * takes the record's value. Untouched fields still fill in, which is what #91 needed: a form that
 * mounted before its record loaded must not save blanks over a real interview.
 *
 * Fields are compared by identity, which is how React state changes: an edited array or object is
 * a new reference, an untouched one is the same reference it was seeded with.
 */
export function mergeSeededValues<TValues extends object>(
  baseline: TValues,
  current: TValues,
  incoming: TValues,
): TValues {
  const merged = { ...incoming };
  for (const key of Object.keys(current) as Array<keyof TValues>) {
    if (!Object.is(current[key], baseline[key])) merged[key] = current[key];
  }
  return merged;
}
