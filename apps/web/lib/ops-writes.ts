import { ApiError, apiFetch, getErrorMessage, readApiError, type GetToken } from './api';
import { db } from './db';
import {
  buildPatientCheckInMutation,
  buildShiftCheckInMutation,
  buildShiftCheckOutMutation,
} from './ops-offline';
import type { ShiftRole } from './ops';
import { enqueueOutboxMutation, type OutboxMutationParams } from './outbox';

/**
 * The clinic-operations writes that work without a connection, and how each one is sent.
 *
 * Every write carries an id made on this device. Online it goes straight to its REST route with
 * that id; if the request never gets an answer, or the device is offline, the same action is
 * queued under the same id. The server treats a second arrival of an id as the action it already
 * applied, so a request that did land before the connection dropped is never applied twice.
 */
export type OpsWrite =
  | { kind: 'shiftCheckIn'; shiftId: string; roleAtShift: ShiftRole }
  | {
      kind: 'shiftCheckOut';
      shiftId: string;
      /**
       * The shift's own start is still queued. Ending it online would reach a server that has
       * not heard of the shift, so the end is queued behind the start instead.
       */
      afterQueuedStart?: boolean;
    }
  | {
      kind: 'patientCheckIn';
      checkInId: string;
      patientId: string;
      patient?: { patientCode?: string; displayName?: string };
    };

export type OpsWriteResult =
  | { outcome: 'applied' }
  | { outcome: 'queued' }
  | { outcome: 'refused'; error: ApiError };

export interface OpsWriteDeps {
  clinicId: string;
  getToken: GetToken;
  isOnline: boolean;
  actor: { userId: string; displayName?: string };
  /** Injected for tests. */
  send?: typeof apiFetch;
  enqueue?: (params: OutboxMutationParams) => Promise<unknown>;
  now?: () => Date;
}

/** A request that never got an answer, as opposed to one the server refused. */
function isUnanswered(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT')
  );
}

function restRequest(write: OpsWrite, clinicId: string): { path: string; body?: object } {
  const clinic = `/clinics/${encodeURIComponent(clinicId)}`;
  switch (write.kind) {
    case 'shiftCheckIn':
      return {
        path: `${clinic}/shifts/check-in`,
        body: { id: write.shiftId, roleAtShift: write.roleAtShift },
      };
    case 'shiftCheckOut':
      return { path: `${clinic}/shifts/${encodeURIComponent(write.shiftId)}/check-out` };
    case 'patientCheckIn':
      return {
        path: `${clinic}/checkins`,
        body: { id: write.checkInId, patientId: write.patientId },
      };
  }
}

function outboxMutation(write: OpsWrite, deps: OpsWriteDeps, occurredAt: string) {
  const queuedBy = {
    clinicId: deps.clinicId,
    occurredAt,
    actorUserId: deps.actor.userId,
    actorName: deps.actor.displayName,
  };
  switch (write.kind) {
    case 'shiftCheckIn':
      return buildShiftCheckInMutation({
        ...queuedBy,
        shiftId: write.shiftId,
        roleAtShift: write.roleAtShift,
      });
    case 'shiftCheckOut':
      return buildShiftCheckOutMutation({ ...queuedBy, shiftId: write.shiftId });
    case 'patientCheckIn':
      return buildPatientCheckInMutation({
        ...queuedBy,
        checkInId: write.checkInId,
        patientId: write.patientId,
        patient: write.patient,
      });
  }
}

export async function submitOpsWrite(write: OpsWrite, deps: OpsWriteDeps): Promise<OpsWriteResult> {
  const send = deps.send ?? apiFetch;
  const enqueue = deps.enqueue ?? ((params) => enqueueOutboxMutation(db, params));
  // Taken before the request, so a queued action records when the person acted, not when the
  // request gave up twelve seconds later.
  const occurredAt = (deps.now?.() ?? new Date()).toISOString();
  const mustQueue =
    !deps.isOnline || (write.kind === 'shiftCheckOut' && write.afterQueuedStart === true);

  if (!mustQueue) {
    const { path, body } = restRequest(write, deps.clinicId);
    try {
      const response = await send(path, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
        getToken: deps.getToken,
        activeClinicId: deps.clinicId,
      });
      if (response.ok) return { outcome: 'applied' };
      return { outcome: 'refused', error: await readApiError(response) };
    } catch (error) {
      if (!isUnanswered(error)) throw error;
    }
  }

  await enqueue(outboxMutation(write, deps, occurredAt));
  return { outcome: 'queued' };
}

/** What to tell someone after an operations write, and where to go next if anywhere. */
export interface OpsFeedback {
  tone: 'success' | 'info' | 'warning' | 'error';
  message: string;
  link?: { href: string; label: string };
}

/**
 * The message for each outcome. Queued is said plainly as saved, not failed: the action is safe
 * on the device, and the board already shows it as pending.
 */
export function opsWriteFeedback(
  result: OpsWriteResult,
  copy: {
    applied: OpsFeedback;
    queued: string;
    /** A clearer message for a refusal the caller expects, or null to use the server's. */
    refused?: (error: ApiError) => OpsFeedback | null;
  },
): OpsFeedback {
  switch (result.outcome) {
    case 'applied':
      return copy.applied;
    case 'queued':
      return { tone: 'info', message: copy.queued };
    case 'refused':
      return (
        copy.refused?.(result.error) ?? { tone: 'error', message: getErrorMessage(result.error) }
      );
  }
}
