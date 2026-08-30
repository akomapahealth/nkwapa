/**
 * One local row per encounter, for the records where the domain says there is only one.
 *
 * `HypertensionAssessment`, `CarePlan`, `DiabetesScreening` and vitals all carry
 * `encounterId String @unique` on the server. The Dexie mirror indexes `encounterId` without a
 * unique constraint, so nothing stops a client writing several rows for the same encounter -- and
 * `HypertensionForm` did exactly that, generating a fresh id inside its save handler.
 *
 * That mattered because of how the encounter page reads them back:
 *
 *     db.hypertension_assessments.where('encounterId').equals(encounterId).first()
 *
 * Dexie iterates the index and, for duplicate index keys, orders by primary key. The primary keys
 * are `crypto.randomUUID()` values, so `.first()` returned whichever save happened to draw the
 * lexicographically smallest UUID -- not the most recent one. A clinician correcting Stage 1 to
 * Crisis could reopen the encounter and be shown Stage 1 again. See issue #91.
 */

export interface EncounterScopedRecord {
  id: string;
  encounterId: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The slice of a Dexie table this needs, so it can be tested without a browser. */
export interface EncounterScopedTable<T extends EncounterScopedRecord> {
  where(index: 'encounterId'): {
    equals(value: string): { toArray(): Promise<T[]> };
  };
  bulkDelete(ids: string[]): Promise<unknown>;
}

export interface ClaimedEncounterRecord {
  /** The id to write under: an existing row's where there is one, a new one otherwise. */
  id: string;
  /** The kept row's original creation time, so an update does not restamp it as new. */
  createdAt?: string;
  /** How many duplicate rows were collapsed. Zero on a healthy encounter. */
  removedDuplicates: number;
}

/**
 * Resolves the single row that should represent this encounter, collapsing any duplicates.
 *
 * The row kept is the most recently updated one, tie-broken by the lowest id. That rule is what
 * makes a client converge on the server's copy rather than oscillating against it: after a push,
 * the pull writes the server's row under the server's id, which carries the freshest `updatedAt`
 * and therefore wins the next time this runs. Keeping the lowest id instead would strand a
 * client-generated id that the server had never heard of.
 */
export async function claimEncounterRecord<T extends EncounterScopedRecord>(
  table: EncounterScopedTable<T>,
  encounterId: string,
  generateId: () => string,
): Promise<ClaimedEncounterRecord> {
  const existing = await table.where('encounterId').equals(encounterId).toArray();

  if (existing.length === 0) {
    return { id: generateId(), removedDuplicates: 0 };
  }

  const [keep, ...duplicates] = [...existing].sort((a, b) => {
    const byUpdated = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    if (byUpdated !== 0) return byUpdated;
    return a.id.localeCompare(b.id);
  });

  if (duplicates.length > 0) {
    // Heals a device that already accumulated rows before this landed. Nothing reads them, but
    // leaving them means `.first()` keeps depending on UUID ordering.
    await table.bulkDelete(duplicates.map((record) => record.id));
  }

  return { id: keep.id, createdAt: keep.createdAt, removedDuplicates: duplicates.length };
}
