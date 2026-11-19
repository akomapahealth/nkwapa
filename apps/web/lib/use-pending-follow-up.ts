'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db } from './db';
import { pendingFollowUpAttempts, type PendingAttempt } from './follow-up-offline';

const NONE: PendingAttempt[] = [];

/** This device's queued follow-up calls for a clinic, kept current as they queue and send. */
export function usePendingFollowUpAttempts(clinicId: string | null): PendingAttempt[] {
  const [attempts, setAttempts] = useState<PendingAttempt[]>(NONE);
  useEffect(() => {
    if (!clinicId) {
      setAttempts(NONE);
      return;
    }
    const subscription = liveQuery(async () =>
      pendingFollowUpAttempts(
        await db.outbox.where('clinicId').equals(clinicId).sortBy('createdAt'),
      ),
    ).subscribe({
      next: setAttempts,
      error: (err) => console.warn('Could not read queued follow-up calls', err),
    });
    return () => subscription.unsubscribe();
  }, [clinicId]);
  return attempts;
}
