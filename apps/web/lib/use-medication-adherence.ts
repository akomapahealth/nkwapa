'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MedicationAdherenceEntry } from '@nkwapa/db';
import { apiFetch, readApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { claimEncounterRecord } from '@/lib/encounter-record';
import { generateClinicalId } from '@/lib/clinical-measurements';
import {
  assembleMedicationRecords,
  sortMedicationRecords,
  type MedicationRecord,
  type MedicationReconciliationView,
} from '@/lib/medication-reconciliation';
import {
  countAnsweredEntries,
  fromAdherenceRecord,
  groupMedicationsForCondition,
  seedAdherenceEntries,
  toAdherencePayload,
  updateAdherenceEntry,
  validateAdherenceEntries,
  type AdherenceFieldErrors,
  type MedicationAdherenceContextValue,
} from '@/lib/medication-adherence';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';

export interface UseMedicationAdherenceResult {
  entries: MedicationAdherenceEntry[];
  forCondition: MedicationRecord[];
  other: MedicationRecord[];
  categoriesUnavailable: boolean;
  errors: AdherenceFieldErrors;
  answeredCount: number;
  loading: boolean;
  loadError: string | null;
  update: (medicationRecordId: string, patch: Partial<MedicationAdherenceEntry>) => void;
  /** Validates and returns the errors; the caller decides whether to block its own save. */
  validate: () => AdherenceFieldErrors;
  /** Writes locally and queues the replay. Throws if validation fails. */
  save: () => Promise<void>;
}

/**
 * The adherence half of a chronic interview: the medication list, the answers, and the save.
 *
 * A hook rather than state inside the section component, because the answers have to be saved by
 * the interview's own `handleSave` -- one tab switch saves the assessment and its adherence
 * together, or neither. A component that owned its own save button would let a volunteer leave the
 * tab with half the section written.
 */
export function useMedicationAdherence(
  clinicId: string,
  encounterId: string,
  patientId: string,
  context: MedicationAdherenceContextValue,
  canEdit: boolean,
): UseMedicationAdherenceResult {
  const getToken = useAuth();
  const [medications, setMedications] = useState<MedicationRecord[]>([]);
  const [entries, setEntries] = useState<MedicationAdherenceEntry[]>([]);
  const [errors, setErrors] = useState<AdherenceFieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /*
    Seed once per encounter and condition, not on every load.

    The medication list is refetched after each save, and re-seeding from the stored record on a
    refetch would replay whatever was on the server over whatever the volunteer has typed since --
    the failure `shouldSeedFormValues` exists to prevent on the interviews themselves. Here the
    same rule is a ref, because the identity that matters is the pair, not a record id.
  */
  const seededFor = useRef<string | null>(null);

  const loadOffline = useCallback(async () => {
    const [records, revisions] = await Promise.all([
      db.patient_medication_records.where('patientId').equals(patientId).toArray(),
      db.patient_medication_revisions.toArray(),
    ]);
    return sortMedicationRecords(assembleMedicationRecords(records, revisions, clinicId));
  }, [clinicId, patientId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      let list: MedicationRecord[] = [];
      try {
        const response = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/medication-reconciliation`,
          { getToken, activeClinicId: clinicId },
        );
        if (!response.ok) throw await readApiError(response);
        const payload = (await response.json()) as MedicationReconciliationView;
        list = sortMedicationRecords(payload.medications);
      } catch (error) {
        /*
          A failed fetch falls back to the cache rather than to an error.

          This section is used at the chair-side, often without signal. The cached rows carry no
          drug catalogue, so the category grouping collapses -- which the section says out loud
          rather than presenting an empty "blood-pressure medications" heading.
        */
        try {
          list = await loadOffline();
        } catch {
          if (!cancelled) {
            setLoadError(
              error instanceof Error ? error.message : 'The medication list is unavailable.',
            );
          }
          if (!cancelled) setLoading(false);
          return;
        }
      }

      const stored = await db.medication_adherence
        .where('[encounterId+context]')
        .equals([encounterId, context])
        .first();

      if (cancelled) return;

      setMedications(list);
      const seedKey = `${encounterId}::${context}`;
      /*
        Read the ref before the updater, not inside it.

        `setEntries` takes a lazy updater: React runs it when it processes the update, which is
        after the assignment below. Reading `seededFor.current` in there therefore always saw the
        key it had just been given, took the "already seeded" branch, and seeded from the empty
        state instead of from the stored record -- so every answer vanished on the first tab
        switch. It survived unit tests because nothing there re-mounts the hook.
      */
      const alreadySeeded = seededFor.current === seedKey;
      seededFor.current = seedKey;
      setEntries((current) =>
        seedAdherenceEntries(list, alreadySeeded ? current : fromAdherenceRecord(stored), context),
      );
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [clinicId, context, encounterId, getToken, loadOffline, patientId]);

  const grouped = useMemo(
    () => groupMedicationsForCondition(medications, context),
    [context, medications],
  );

  const update = useCallback(
    (medicationRecordId: string, patch: Partial<MedicationAdherenceEntry>) => {
      setEntries((current) => {
        const next = updateAdherenceEntry(current, medicationRecordId, patch, context);
        /*
          Revalidate only what is already showing an error.

          MASTER.md section 10: validate on submit, then per field as it is corrected. Validating
          as someone types the first character of a barrier tells them it is wrong before they have
          finished writing it.
        */
        setErrors((currentErrors) =>
          Object.keys(currentErrors).length
            ? validateAdherenceEntries(next, context)
            : currentErrors,
        );
        return next;
      });
    },
    [context],
  );

  const validate = useCallback(() => {
    const found = validateAdherenceEntries(entries, context);
    setErrors(found);
    return found;
  }, [context, entries]);

  const save = useCallback(async () => {
    if (!canEdit) return;

    const found = validateAdherenceEntries(entries, context);
    setErrors(found);
    if (Object.keys(found).length) {
      throw new Error('Check the highlighted medication answers before saving.');
    }

    const payload = toAdherencePayload(clinicId, encounterId, context, entries);
    /*
      One local row per encounter and condition.

      `claimEncounterRecord` is narrowed by context, so the hypertension and diabetes sets live
      side by side under the same `encounterId` without the duplicate cleanup deleting the one the
      volunteer is not looking at.
    */
    const claimed = await claimEncounterRecord(
      db.medication_adherence,
      encounterId,
      generateClinicalId,
      (record) => record.context === context,
    );
    const now = new Date().toISOString();

    await db.medication_adherence.put({
      id: claimed.id,
      clinicId,
      encounterId,
      context,
      entries: payload.entries,
      createdAt: claimed.createdAt ?? now,
      updatedAt: now,
    } as never);

    await enqueueOutboxMutation(db, {
      clinicId,
      entityType: 'encounter_medication_adherence',
      entityId: claimed.id,
      operation: SYNC_OPERATION.UPSERT,
      payloadJson: payload,
    });
  }, [canEdit, clinicId, context, encounterId, entries]);

  return {
    entries,
    forCondition: grouped.forCondition,
    other: grouped.other,
    categoriesUnavailable: grouped.categoriesUnavailable,
    errors,
    answeredCount: countAnsweredEntries(entries),
    loading,
    loadError,
    update,
    validate,
    save,
  };
}
