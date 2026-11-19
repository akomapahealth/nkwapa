import { ApiError, apiFetch, readApiError, type GetToken } from './api';
import { db, type OutboxRecord, type OutboxSyncState } from './db';
import {
  enqueueOutboxMutation,
  outboxSyncState,
  SYNC_OPERATION,
  type OutboxMutationParams,
} from './outbox';
import { parseOutboxPayload } from './sync-conflicts';
import type {
  ContactDetail,
  RecordAttemptInput,
  WorklistFilters,
  WorklistPage,
  WorklistTab,
} from './follow-up-contacts';

/*
  Follow-up offline (#338). The device keeps the clinic's open contacts due within the week, with
  what the record sheet needs, so a volunteer can keep calling when the connection drops. A call is
  recorded with an id made on this device: online it goes to its REST route, and when the device is
  offline or the request never gets an answer it is queued under the same id. The server records an
  id once, so a call that landed before the connection dropped is never recorded twice.

  Taking and cancelling a contact stay online: both act on what other people are doing right now.
*/

export const FOLLOW_UP_ATTEMPT_ENTITY = 'follow_up_attempt';

/** The offline copy: open contacts due by a week from `today`, most urgent first. */
export interface FollowUpPacket {
  today: string;
  items: ContactDetail[];
  /** The server cut the list short; the device copy is not the whole week. */
  truncated: boolean;
}

export function isFollowUpPacket(data: unknown): data is FollowUpPacket {
  const value = data as FollowUpPacket | null;
  return (
    typeof value?.today === 'string' &&
    Array.isArray(value.items) &&
    typeof value.truncated === 'boolean'
  );
}

export async function fetchFollowUpPacket(
  clinicId: string,
  getToken: GetToken,
  signal: AbortSignal,
): Promise<FollowUpPacket> {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/follow-up/contacts/offline`,
    { getToken, signal },
  );
  if (!res.ok)
    throw new Error(`The offline copy of follow-up could not be loaded (${res.status}).`);
  return (await res.json()) as FollowUpPacket;
}

/**
 * A due tab drawn from the offline copy, filtered and ordered as the server would. The copy is
 * already most urgent first, then by due day. Done needs the server.
 */
export function packetPage(
  packet: FollowUpPacket,
  tab: Exclude<WorklistTab, 'done'>,
  filters: WorklistFilters,
  today: string,
  userId: string | null,
): WorklistPage {
  const q = filters.q.trim().toLowerCase();
  const items = packet.items
    .map((item) => {
      const late = Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${item.dueOn}T00:00:00Z`)) / 86_400_000,
      );
      return { ...item, daysOverdue: Math.max(0, late) };
    })
    .filter((item) => {
      if (tab === 'today' && !(item.status === 'DUE' && item.dueOn === today)) return false;
      if (tab === 'overdue' && !(item.dueOn < today)) return false;
      if (tab === 'week' && !(item.status === 'DUE' && item.dueOn > today)) return false;
      if (filters.mode && item.mode !== filters.mode) return false;
      if (filters.tier && item.patient.tier !== filters.tier) return false;
      if (filters.owner === 'me' && item.owner?.id !== userId) return false;
      if (filters.owner === 'none' && item.owner) return false;
      return (
        !q ||
        item.patient.name.toLowerCase().includes(q) ||
        item.patient.patientCode.toLowerCase().includes(q)
      );
    });
  return { items, nextCursor: null };
}

/** A call still on this device, by the contact it was for. */
export interface PendingAttempt {
  attemptId: string;
  contactId: string;
  /** Any outcome but "not reached", which completes the contact once it sends. */
  reached: boolean;
  state: OutboxSyncState;
}

export function pendingFollowUpAttempts(rows: readonly OutboxRecord[]): PendingAttempt[] {
  return rows.flatMap((row) => {
    if (row.entityType !== FOLLOW_UP_ATTEMPT_ENTITY) return [];
    const payload = parseOutboxPayload(row);
    if (typeof payload.contactId !== 'string') return [];
    return [
      {
        attemptId: row.entityId,
        contactId: payload.contactId,
        reached: payload.outcome !== 'ATTEMPTED',
        state: outboxSyncState(row),
      },
    ];
  });
}

export function followUpAttemptKey(attemptId: string): string {
  return `follow-up-attempt-${attemptId}`;
}

export function buildFollowUpAttemptMutation(input: {
  clinicId: string;
  attemptId: string;
  contactId: string;
  occurredAt: string;
  attempt: RecordAttemptInput;
  patient: { patientCode: string; name: string };
  actor: { userId: string; displayName?: string };
}): OutboxMutationParams {
  return {
    clinicId: input.clinicId,
    entityType: FOLLOW_UP_ATTEMPT_ENTITY,
    entityId: input.attemptId,
    operation: SYNC_OPERATION.UPSERT,
    payloadJson: {
      schemaVersion: 1,
      contactId: input.contactId,
      occurredAt: input.occurredAt,
      ...input.attempt,
    },
    idempotencyKey: followUpAttemptKey(input.attemptId),
    localContext: {
      patientCode: input.patient.patientCode,
      patientName: input.patient.name,
      actorUserId: input.actor.userId,
      actorName: input.actor.displayName,
    },
  };
}

export type AttemptWriteResult =
  | { outcome: 'applied'; contactStatus: 'DONE' | 'DUE'; urgent: boolean }
  | { outcome: 'queued' }
  | { outcome: 'refused'; error: ApiError };

function isUnanswered(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT')
  );
}

/** Record a call online, or queue it under the same id when that cannot reach the server. */
export async function submitFollowUpAttempt(
  input: {
    clinicId: string;
    contact: Pick<ContactDetail, 'id' | 'patient'>;
    attemptId: string;
    attempt: RecordAttemptInput;
  },
  deps: {
    getToken: GetToken | undefined;
    isOnline: boolean;
    actor: { userId: string; displayName?: string };
    /** Injected for tests. */
    send?: typeof apiFetch;
    enqueue?: (params: OutboxMutationParams) => Promise<unknown>;
  },
): Promise<AttemptWriteResult> {
  const send = deps.send ?? apiFetch;
  const enqueue = deps.enqueue ?? ((params) => enqueueOutboxMutation(db, params));
  // Taken before the request, so a queued call is dated when it was made.
  const occurredAt = new Date().toISOString();
  if (deps.isOnline) {
    try {
      const res = await send(
        `/clinics/${encodeURIComponent(input.clinicId)}/follow-up/contacts/${encodeURIComponent(input.contact.id)}/attempts`,
        {
          getToken: deps.getToken,
          method: 'POST',
          body: JSON.stringify({ id: input.attemptId, ...input.attempt }),
          activeClinicId: input.clinicId,
          idempotencyKey: followUpAttemptKey(input.attemptId),
        },
      );
      if (!res.ok) return { outcome: 'refused', error: await readApiError(res) };
      const body = (await res.json()) as { contactStatus: 'DONE' | 'DUE'; urgent: boolean };
      return { outcome: 'applied', contactStatus: body.contactStatus, urgent: body.urgent };
    } catch (error) {
      if (!isUnanswered(error)) throw error;
    }
  }
  await enqueue(
    buildFollowUpAttemptMutation({
      clinicId: input.clinicId,
      attemptId: input.attemptId,
      contactId: input.contact.id,
      occurredAt,
      attempt: input.attempt,
      patient: { patientCode: input.contact.patient.patientCode, name: input.contact.patient.name },
      actor: deps.actor,
    }),
  );
  return { outcome: 'queued' };
}
