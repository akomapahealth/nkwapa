'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type OutboxRecord, type OutboxSyncState } from './db';
import { outboxSyncState } from './outbox';
import { outboxEncounterId, outboxPatientId, syncEntityLabel } from './sync-conflicts';

export interface OutboxQueueItem {
  row: OutboxRecord;
  state: OutboxSyncState;
  /** What the change is, e.g. "Vital signs". */
  label: string;
  patientId?: string;
  /** The patient's name or chart code from the local store, when the device has the chart. */
  patientName?: string;
}

export interface OutboxQueue {
  loaded: boolean;
  blocked: OutboxQueueItem[];
  retrying: OutboxQueueItem[];
  pending: OutboxQueueItem[];
  total: number;
}

const EMPTY_QUEUE: OutboxQueue = {
  loaded: false,
  blocked: [],
  retrying: [],
  pending: [],
  total: 0,
};

/** Split a clinic's queue by what it needs from the clinician. Oldest first within each group. */
export function groupOutboxQueue(items: OutboxQueueItem[]): OutboxQueue {
  return {
    loaded: true,
    blocked: items.filter((item) => item.state === 'blocked'),
    retrying: items.filter((item) => item.state === 'retrying'),
    pending: items.filter((item) => item.state === 'pending'),
    total: items.length,
  };
}

async function loadOutboxQueue(clinicId: string): Promise<OutboxQueueItem[]> {
  const rows = await db.outbox.where('clinicId').equals(clinicId).sortBy('createdAt');
  return Promise.all(
    rows.map(async (row) => {
      let patientId = outboxPatientId(row);
      if (!patientId) {
        const encounterId = outboxEncounterId(row);
        patientId = encounterId ? (await db.encounters.get(encounterId))?.patientId : undefined;
      }
      const patient = patientId ? await db.patients.get(patientId) : undefined;
      const patientName = patient
        ? [patient.firstName, patient.lastName].filter(Boolean).join(' ') || patient.patientCode
        : undefined;
      return {
        row,
        state: outboxSyncState(row),
        label: syncEntityLabel(row.entityType),
        patientId,
        patientName,
      };
    }),
  );
}

/**
 * The clinic's offline queue, kept current as rows are added, refused, retried, or applied.
 *
 * A Dexie live query rather than the 2.5-second poll the header used to run: it re-reads only when
 * the outbox or the stores it names actually change, and a save shows up immediately.
 */
export function useOutboxQueue(clinicId: string | null | undefined): OutboxQueue {
  const [queue, setQueue] = useState<OutboxQueue>(EMPTY_QUEUE);

  useEffect(() => {
    if (!clinicId) {
      setQueue({ ...EMPTY_QUEUE, loaded: true });
      return;
    }
    const subscription = liveQuery(() => loadOutboxQueue(clinicId)).subscribe({
      next: (items) => setQueue(groupOutboxQueue(items)),
      error: (err) => console.warn('Could not read the offline queue', err),
    });
    return () => subscription.unsubscribe();
  }, [clinicId]);

  return queue;
}
