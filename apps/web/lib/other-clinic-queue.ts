'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type OutboxRecord } from './db';
import { isOwnedBy } from './outbox';

/**
 * Changes saved on this device for clinics other than the active one (#163).
 *
 * The outbox, the pill and the sync center are all scoped to the active clinic, and a clinic is
 * only pushed while it is active. An account that loses its seat at a clinic is never offered it
 * as active again, so changes queued there sat in IndexedDB where nobody could see them. This
 * finds them, device-wide, so the sync center can name them and say what can be done.
 */

export interface OtherClinicQueue {
  clinicId: string;
  /** From bootstrap while the account can open the clinic, otherwise as recorded when queued. */
  clinicName: string | null;
  /**
   * `available`: the account can switch to the clinic, which sends its changes there.
   * `lost`: the account can no longer open it, so it can never send them.
   */
  access: 'available' | 'lost';
  /** This account's changes, plus any queued before owners were recorded. */
  own: OutboxRecord[];
  /** Other accounts' changes. Never sent or discarded by this account; listed so they are seen. */
  others: OutboxRecord[];
}

/**
 * Group the queued changes that are not for `activeClinicId` by clinic, available clinics first,
 * each by name. A change is only ever pushed to its own clinic, so nothing here is sent from the
 * active clinic.
 */
export function groupOtherClinicQueues(
  rows: ReadonlyArray<OutboxRecord>,
  params: {
    activeClinicId: string | null | undefined;
    currentUserId: string | null | undefined;
    accessibleClinics: ReadonlyArray<{ clinicId: string; clinicName: string }>;
  },
): OtherClinicQueue[] {
  const accessible = new Map(
    params.accessibleClinics.map((clinic) => [clinic.clinicId, clinic.clinicName]),
  );
  const groups = new Map<string, OtherClinicQueue>();
  for (const row of rows) {
    if (row.clinicId === params.activeClinicId) continue;
    let group = groups.get(row.clinicId);
    if (!group) {
      group = {
        clinicId: row.clinicId,
        clinicName: accessible.get(row.clinicId) ?? null,
        access: accessible.has(row.clinicId) ? 'available' : 'lost',
        own: [],
        others: [],
      };
      groups.set(row.clinicId, group);
    }
    group.clinicName ??= row.clinicName ?? null;
    const unowned = !row.ownerUserId;
    if (unowned || isOwnedBy(row, params.currentUserId)) group.own.push(row);
    else group.others.push(row);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.access === 'lost') - Number(b.access === 'lost') ||
      (a.clinicName ?? '').localeCompare(b.clinicName ?? ''),
  );
}

/** `groupOtherClinicQueues`, kept current as the outbox changes. */
export function useOtherClinicQueues(params: {
  activeClinicId: string | null | undefined;
  currentUserId: string | null | undefined;
  accessibleClinics: ReadonlyArray<{ clinicId: string; clinicName: string }>;
}): OtherClinicQueue[] {
  const [queues, setQueues] = useState<OtherClinicQueue[]>([]);
  const { activeClinicId, currentUserId, accessibleClinics } = params;
  const accessibleKey = accessibleClinics
    .map((clinic) => `${clinic.clinicId}:${clinic.clinicName}`)
    .join('|');

  useEffect(() => {
    const subscription = liveQuery(() =>
      activeClinicId
        ? db.outbox.where('clinicId').notEqual(activeClinicId).sortBy('createdAt')
        : db.outbox.orderBy('createdAt').toArray(),
    ).subscribe({
      next: (rows) =>
        setQueues(
          groupOtherClinicQueues(rows, { activeClinicId, currentUserId, accessibleClinics }),
        ),
      error: (err) => console.warn('Could not read the offline queue for other clinics', err),
    });
    return () => subscription.unsubscribe();
    // accessibleKey stands in for accessibleClinics, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClinicId, currentUserId, accessibleKey]);

  return queues;
}
