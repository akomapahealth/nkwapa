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
