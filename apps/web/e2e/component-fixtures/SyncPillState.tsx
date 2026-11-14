import { createContext, useContext } from 'react';
import type { OutboxQueue, OutboxQueueItem } from '@/lib/use-outbox-queue';

export const PillFixtureContext = createContext('synced');

// The pill, state priority and sync sheet are production; queue inputs and pass events are isolated.
export function useOutboxQueue(): OutboxQueue {
  const state = useContext(PillFixtureContext);
  const item = (index: number): OutboxQueueItem => ({
    state: state === 'attention' ? 'blocked' : 'pending',
    label: 'Synthetic vital signs',
    row: {
      id: `synthetic-${index}`,
      clinicId: 'synthetic-clinic',
      entityType: 'vitals',
      entityId: `synthetic-encounter-${index}`,
      operation: 'UPSERT',
      payloadJson: '{}',
      idempotencyKey: `synthetic-key-${index}`,
      createdAt: '2026-11-08T12:00:00Z',
      ownerUserId: 'synthetic-owner',
      ownerName: 'Synthetic colleague',
    },
  });
  const blocked = state === 'attention' ? [item(1)] : [];
  const pending = state === 'queued' || state === 'offline' ? [item(1), item(2)] : [];
  return {
    loaded: true,
    blocked,
    pending,
    retrying: [],
    held: state === 'held' ? [item(1)] : [],
    total: blocked.length + pending.length,
  };
}

export function useOtherClinicQueues() {
  return [];
}

// Transport events are covered by sync-recovery.spec.js, outside this presentation fixture.
export function onSyncPassComplete() {
  return () => {};
}
