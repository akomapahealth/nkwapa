'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type OutboxRecord, type OutboxSyncState } from './db';
import { isOwnedBy, outboxSyncState } from './outbox';
import {
  outboxEncounterId,
  outboxPatientId,
  parseOutboxPayload,
  syncEntityLabel,
} from './sync-conflicts';

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
  /** This account's changes, the ones it can send. */
  total: number;
  /**
   * Changes another account queued on this device, or that predate owners being recorded (#162).
   * Never sent by this account and never counted in its pill; shown so they are not invisible.
   */
  held: OutboxQueueItem[];
}

const EMPTY_QUEUE: OutboxQueue = {
  loaded: false,
  blocked: [],
  retrying: [],
  pending: [],
  total: 0,
  held: [],
};

/**
 * Split a clinic's queue by what it needs from the clinician. Oldest first within each group.
 * Only `currentUserId`'s own changes are grouped by state; everything else is held.
 */
export function groupOutboxQueue(
  items: OutboxQueueItem[],
  currentUserId: string | null | undefined,
): OutboxQueue {
  const own = items.filter((item) => isOwnedBy(item.row, currentUserId));
  return {
    loaded: true,
    blocked: own.filter((item) => item.state === 'blocked'),
    retrying: own.filter((item) => item.state === 'retrying'),
    pending: own.filter((item) => item.state === 'pending'),
    total: own.length,
    held: items.filter((item) => !isOwnedBy(item.row, currentUserId)),
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
      // A chart registered offline and refused is not in the local store; its own change still
      // carries the name that was typed.
      const named = patient ?? (row.entityType === 'patient' ? parseOutboxPayload(row) : undefined);
      const patientName =
        [named?.firstName, named?.lastName]
          .filter((part) => typeof part === 'string' && part)
          .join(' ') || (typeof named?.patientCode === 'string' ? named.patientCode : undefined);
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
export function useOutboxQueue(
  clinicId: string | null | undefined,
  currentUserId: string | null | undefined,
): OutboxQueue {
  const [queue, setQueue] = useState<OutboxQueue>(EMPTY_QUEUE);

  useEffect(() => {
    if (!clinicId) {
      setQueue({ ...EMPTY_QUEUE, loaded: true });
      return;
    }
    const subscription = liveQuery(() => loadOutboxQueue(clinicId)).subscribe({
      next: (items) => setQueue(groupOutboxQueue(items, currentUserId)),
      error: (err) => console.warn('Could not read the offline queue', err),
    });
    return () => subscription.unsubscribe();
  }, [clinicId, currentUserId]);

  return queue;
}
