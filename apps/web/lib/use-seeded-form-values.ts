'use client';

import { useEffect, useRef, useState } from 'react';
import { shouldSeedFormValues } from '@/lib/form-seeding';

/**
 * Hold a form's values, seeding them from a record that arrives after the form mounts.
 *
 * `useState(initial)` reads its argument once, and the encounter page loads these records
 * asynchronously, so the form has to catch up when one lands -- but only once per record. See
 * `shouldSeedFormValues` for why both halves of that matter.
 *
 * The identity is a parameter rather than `record.id` because not every seeded record carries
 * one: the clinician plan is a projection of its assessment's columns and is identified by the
 * encounter it belongs to.
 */
export function useSeededFormValues<TRecord, TValues>(
  recordId: string | null | undefined,
  record: TRecord,
  fromRecord: (record: TRecord) => TValues,
): [TValues, React.Dispatch<React.SetStateAction<TValues>>] {
  const [values, setValues] = useState<TValues>(() => fromRecord(record));
  const hasSeeded = useRef(false);
  const seededRecordId = useRef<string | null | undefined>(undefined);

  // `fromRecord` is in the dependencies rather than held in a ref: `shouldSeedFormValues` means
  // an extra run of this effect decides nothing, so a caller passing an inline mapper is harmless.
  useEffect(() => {
    const seed = shouldSeedFormValues({
      hasRecord: Boolean(record),
      recordId,
      hasSeeded: hasSeeded.current,
      seededRecordId: seededRecordId.current,
    });
    if (!seed) return;
    hasSeeded.current = true;
    seededRecordId.current = recordId;
    setValues(fromRecord(record));
  }, [record, recordId, fromRecord]);

  return [values, setValues];
}
