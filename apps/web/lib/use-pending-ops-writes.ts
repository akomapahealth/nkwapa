'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db } from './db';
import { pendingOpsWrites, type PendingOpsWrite } from './ops-offline';

const NONE: PendingOpsWrite[] = [];

/**
 * This device's queued shift and check-in changes for a clinic, kept current as they are queued,
 * refused, or applied. A live query, so a tap shows on the board the moment it is saved.
 */
export function usePendingOpsWrites(clinicId: string | null | undefined): PendingOpsWrite[] {
  const [writes, setWrites] = useState<PendingOpsWrite[]>(NONE);

  useEffect(() => {
    if (!clinicId) {
      setWrites(NONE);
      return;
    }
    const subscription = liveQuery(async () =>
      pendingOpsWrites(await db.outbox.where('clinicId').equals(clinicId).sortBy('createdAt')),
    ).subscribe({
      next: setWrites,
      error: (err) => console.warn('Could not read queued clinic operations', err),
    });
    return () => subscription.unsubscribe();
  }, [clinicId]);

  return writes;
}
