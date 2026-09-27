'use client';

import type { Table } from 'dexie';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, readApiError } from './api';
import { useAuth } from './auth-context';
import { db, type EncounterRecord } from './db';

/** What every encounter-sourced screening history item carries, whichever condition it records. */
export interface ScreeningHistoryItemBase {
  id: string;
  collectedAt: string;
  sourceEncounter: { id: string; createdAt: string; status: string };
}

export interface LocalScreeningContext {
  encounter: EncounterRecord | undefined;
  encounterStatus: string;
}

export interface ScreeningHistoryOptions<TItem, TLocal> {
  clinicId: string;
  patientId: string;
  /** The patient-scoped history route, e.g. `diabetes-screenings`. */
  resource: string;
  /** The device store the same records are synced into, for the offline fallback. */
  localTable: Table<TLocal, string>;
  /** Keep this stable (module level): it is a dependency of the load. */
  fromLocal: (record: TLocal, context: LocalScreeningContext) => TItem | Promise<TItem>;
  failureMessage: string;
  /** Changes when the caller knows a record was saved, so the history reloads to include it. */
  refreshKey?: string | number | null;
}

export interface ScreeningHistoryState<TItem> {
  items: TItem[];
  loading: boolean;
  error: string | null;
  /** What is on screen came from this device, so it may be missing records made elsewhere. */
  servedFromCache: boolean;
  reload: () => Promise<void>;
}

/**
 * Server history first, the device's synced copy when the server cannot be reached.
 *
 * Diabetes had this logic inline and hypertension had no history at all. One loader keeps the two
 * sections honest in the same way: an offline history says it is offline instead of passing stale
 * records off as current, and only a history that is genuinely empty reports the error.
 */
export function useScreeningHistory<
  TItem extends ScreeningHistoryItemBase,
  TLocal extends { clinicId: string; encounterId: string },
>({
  clinicId,
  patientId,
  resource,
  localTable,
  fromLocal,
  failureMessage,
  refreshKey,
}: ScreeningHistoryOptions<TItem, TLocal>): ScreeningHistoryState<TItem> {
  const getToken = useAuth();
  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servedFromCache, setServedFromCache] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setServedFromCache(false);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/${resource}?limit=100`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw await readApiError(response);
      const payload = (await response.json()) as { items: TItem[] };
      setItems(payload.items);
    } catch (loadError) {
      const encounters = (
        await db.encounters.where('patientId').equals(patientId).toArray()
      ).filter((encounter) => encounter.clinicId === clinicId);
      const encountersById = new Map(encounters.map((encounter) => [encounter.id, encounter]));
      const records = (await localTable.where('clinicId').equals(clinicId).toArray()).filter(
        (record) => encountersById.has(record.encounterId),
      );
      const cached = (
        await Promise.all(
          records.map((record) => {
            const encounter = encountersById.get(record.encounterId);
            return fromLocal(record, { encounter, encounterStatus: encounter?.status ?? 'DRAFT' });
          }),
        )
      ).sort(
        (left, right) =>
          new Date(right.collectedAt).getTime() - new Date(left.collectedAt).getTime(),
      );
      setItems(cached);
      if (cached.length === 0) {
        setError(loadError instanceof Error ? loadError.message : failureMessage);
      } else {
        setServedFromCache(true);
      }
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, patientId, resource, failureMessage, localTable, fromLocal]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { items, loading, error, servedFromCache, reload: load };
}
