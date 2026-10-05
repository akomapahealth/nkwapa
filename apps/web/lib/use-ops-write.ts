'use client';

import { useCallback } from 'react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from './auth-context';
import { useBootstrap } from './bootstrap-context';
import { submitOpsWrite, type OpsWrite, type OpsWriteResult } from './ops-writes';

/**
 * `submitOpsWrite` bound to the signed-in user, the connection, and a clinic.
 *
 * Returns `null` until there is a signed-in user to attribute a queued change to.
 */
export function useOpsWrite(
  clinicId: string | null,
): ((write: OpsWrite) => Promise<OpsWriteResult>) | null {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const userId = bootstrap?.userId ?? null;
  const displayName = bootstrap?.displayName ?? undefined;

  const submit = useCallback(
    (write: OpsWrite) => {
      if (!clinicId || !getToken || !userId) {
        throw new Error('Clinic operations need a signed-in user and an active clinic');
      }
      return submitOpsWrite(write, {
        clinicId,
        getToken,
        isOnline,
        actor: { userId, displayName },
      });
    },
    [clinicId, displayName, getToken, isOnline, userId],
  );

  return clinicId && getToken && userId ? submit : null;
}
