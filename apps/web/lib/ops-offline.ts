import { todayInTimeZone } from '@nkwapa/db/clinic-day';
import type { OutboxLocalContext, OutboxRecord, OutboxSyncState } from './db';
import type { ActiveShift, CheckInSummary, ShiftRole } from './ops';
import { SYNC_OPERATION, outboxSyncState, type OutboxMutationParams } from './outbox';
import { parseOutboxPayload } from './sync-conflicts';

/**
 * Offline support for clinic operations: which actions queue, what they queue, and how a queued
 * action is drawn on a board that has not heard about it yet.
 *
 * Only actions the server can replay without ever doubling up are queued. Each record gets its id
 * on this device, and the server treats a second arrival of that id as the same action.
 * Assigning a patient and starting a visit are not on the list: both depend on who is on duty at
 * the moment they happen, and a manager's choice made against a stale roster is not one the
 * server should apply later on their behalf.
 */

export const OPS_ENTITY = {
  SHIFT_CHECK_IN: 'shift_check_in',
  SHIFT_CHECK_OUT: 'shift_check_out',
  PATIENT_CHECK_IN: 'patient_check_in',
} as const;

export type OpsEntityType = (typeof OPS_ENTITY)[keyof typeof OPS_ENTITY];

const OPS_ENTITY_TYPES: ReadonlySet<string> = new Set(Object.values(OPS_ENTITY));

export function isOpsEntityType(value: string): value is OpsEntityType {
  return OPS_ENTITY_TYPES.has(value);
}

/**
 * One action, one key. Deriving it from the record's id rather than drawing a fresh one means a
 * double tap, or a request that timed out and was queued, can only ever be the same action.
 */
export function opsIdempotencyKey(entityType: OpsEntityType, entityId: string): string {
  return `ops:${entityType}:${entityId}`;
}

const SCHEMA_VERSION = 1;

function opsMutation(
  clinicId: string,
  entityType: OpsEntityType,
  entityId: string,
  payload: Record<string, unknown>,
  localContext: OutboxLocalContext,
): OutboxMutationParams {
  return {
    clinicId,
    entityType,
    entityId,
    operation: SYNC_OPERATION.UPSERT,
    payloadJson: Object.fromEntries(
      Object.entries({ schemaVersion: SCHEMA_VERSION, ...payload }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
    idempotencyKey: opsIdempotencyKey(entityType, entityId),
    localContext,
  };
}

interface QueuedActor {
  clinicId: string;
  /** When it happened on this device, ISO 8601. */
  occurredAt: string;
  actorUserId: string;
  actorName?: string;
}

export function buildShiftCheckInMutation(
  input: QueuedActor & { shiftId: string; roleAtShift: ShiftRole; notes?: string },
): OutboxMutationParams {
  return opsMutation(
    input.clinicId,
    OPS_ENTITY.SHIFT_CHECK_IN,
    input.shiftId,
    { occurredAt: input.occurredAt, roleAtShift: input.roleAtShift, notes: input.notes },
    { actorUserId: input.actorUserId, actorName: input.actorName },
  );
}

export function buildShiftCheckOutMutation(
  input: QueuedActor & { shiftId: string },
): OutboxMutationParams {
  return opsMutation(
    input.clinicId,
    OPS_ENTITY.SHIFT_CHECK_OUT,
    input.shiftId,
    { occurredAt: input.occurredAt },
    { actorUserId: input.actorUserId, actorName: input.actorName },
  );
}

export function buildPatientCheckInMutation(
  input: QueuedActor & {
    checkInId: string;
    patientId: string;
    patient?: { patientCode?: string; displayName?: string };
    notes?: string;
  },
): OutboxMutationParams {
  return opsMutation(
    input.clinicId,
    OPS_ENTITY.PATIENT_CHECK_IN,
    input.checkInId,
    { occurredAt: input.occurredAt, patientId: input.patientId, notes: input.notes },
    {
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      patientCode: input.patient?.patientCode,
      patientName: input.patient?.displayName,
    },
  );
}

/** A clinic-operations change still on this device, read back from its outbox row. */
export interface PendingOpsWrite {
  entityType: OpsEntityType;
  entityId: string;
  state: OutboxSyncState;
  occurredAt: string;
  payload: Record<string, unknown>;
  localContext: OutboxLocalContext;
}

export function pendingOpsWrites(rows: readonly OutboxRecord[]): PendingOpsWrite[] {
  return rows.flatMap((row) => {
    if (!isOpsEntityType(row.entityType)) return [];
    const payload = parseOutboxPayload(row);
    return [
      {
        entityType: row.entityType,
        entityId: row.entityId,
        state: outboxSyncState(row),
        occurredAt: typeof payload.occurredAt === 'string' ? payload.occurredAt : row.createdAt,
        payload,
        localContext: row.localContext ?? {},
      },
    ];
  });
}

/** A board row the server has not confirmed yet, and where its change stands. */
export type WithPendingSync<T> = T & {
  /** Set while a check-in or start of shift is still on this device. */
  pendingSync?: OutboxSyncState;
  /** Set while the end of this shift is still on this device. */
  pendingCheckOut?: OutboxSyncState;
};

export const PENDING_SYNC_LABEL: Record<OutboxSyncState, string> = {
  pending: 'Pending sync',
  retrying: 'Retrying sync',
  blocked: 'Needs attention',
};

/**
 * The roster with this device's queued shift changes drawn in.
 *
 * The server's copy always wins: once a queued start of shift appears in a loaded roster it has
 * applied, and the queued copy is no longer drawn. A queued end of shift keeps the shift listed,
 * marked as ending, because the person is still on the floor until the server agrees.
 */
export function overlayPendingShifts(
  shifts: readonly ActiveShift[],
  pending: readonly PendingOpsWrite[],
  actor: { userId: string | null | undefined; displayName?: string | null },
): WithPendingSync<ActiveShift>[] {
  const ending = new Map(
    pending
      .filter((write) => write.entityType === OPS_ENTITY.SHIFT_CHECK_OUT)
      .map((write) => [write.entityId, write.state]),
  );
  const known = new Set(shifts.map((shift) => shift.shiftId));

  const queued: WithPendingSync<ActiveShift>[] = pending
    .filter((write) => write.entityType === OPS_ENTITY.SHIFT_CHECK_IN && !known.has(write.entityId))
    .flatMap((write) => {
      const userId = write.localContext.actorUserId ?? actor.userId;
      const role = write.payload.roleAtShift;
      if (!userId || typeof role !== 'string') return [];
      return [
        {
          shiftId: write.entityId,
          userId,
          displayName: write.localContext.actorName ?? actor.displayName ?? 'You',
          roleAtShift: role as ShiftRole,
          checkedInAt: write.occurredAt,
          status: 'ACTIVE' as const,
          pendingSync: write.state,
        },
      ];
    });

  return [...shifts, ...queued].map((shift) => {
    const checkOut = ending.get(shift.shiftId);
    return checkOut ? { ...shift, pendingCheckOut: checkOut } : shift;
  });
}

/**
 * The patient queue with this device's queued arrivals drawn in, for the clinic day on screen.
 *
 * A queued arrival is drawn as waiting, the state every new check-in starts in. It names the
 * patient from the outbox row's local context, so it shows even for a chart this device never
 * pulled.
 */
export function overlayPendingCheckIns(
  checkIns: readonly CheckInSummary[],
  pending: readonly PendingOpsWrite[],
  board: { clinicId: string; date: string; timezone: string },
): WithPendingSync<CheckInSummary>[] {
  const known = new Set(checkIns.map((checkIn) => checkIn.id));

  const queued: WithPendingSync<CheckInSummary>[] = pending
    .filter(
      (write) =>
        write.entityType === OPS_ENTITY.PATIENT_CHECK_IN &&
        !known.has(write.entityId) &&
        typeof write.payload.patientId === 'string' &&
        todayInTimeZone(board.timezone, new Date(write.occurredAt)) === board.date,
    )
    .map((write) => {
      const [firstName = '', ...rest] = (write.localContext.patientName ?? '').split(' ');
      return {
        id: write.entityId,
        clinicId: board.clinicId,
        patientId: write.payload.patientId as string,
        checkedInAt: write.occurredAt,
        source: 'STAFF',
        status: 'WAITING' as const,
        encounterId: null,
        notes: typeof write.payload.notes === 'string' ? write.payload.notes : null,
        patient: {
          id: write.payload.patientId as string,
          patientCode: write.localContext.patientCode ?? 'Pending chart code',
          firstName,
          lastName: rest.join(' '),
          displayName: write.localContext.patientName ?? 'Patient checked in offline',
        },
        assignmentSummary: null,
        pendingSync: write.state,
      };
    });

  return [...checkIns, ...queued].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
}

/** Every clinic-operations action, and whether it can be done without a connection. */
export type OpsAction =
  | 'shiftCheckIn'
  | 'shiftCheckOut'
  | 'patientCheckIn'
  | 'assign'
  | 'reassign'
  | 'startIntake';

export interface OpsOfflineSupport {
  offline: boolean;
  /** What to tell someone about this action while the connection is down. */
  offlineHint: string;
}

export const OPS_OFFLINE_SUPPORT: Record<OpsAction, OpsOfflineSupport> = {
  shiftCheckIn: {
    offline: true,
    offlineHint: 'Your shift is saved on this device and syncs when the connection returns.',
  },
  shiftCheckOut: {
    offline: true,
    offlineHint: 'Ending your shift is saved on this device and syncs when the connection returns.',
  },
  patientCheckIn: {
    offline: true,
    offlineHint: 'The check-in is saved on this device and syncs when the connection returns.',
  },
  assign: {
    offline: false,
    offlineHint:
      'Assigning needs a connection, so the pair is chosen from who is actually on duty right now.',
  },
  reassign: {
    offline: false,
    offlineHint:
      'Reassigning needs a connection, so the new pair is chosen from who is actually on duty.',
  },
  startIntake: {
    offline: false,
    offlineHint: 'Starting a visit needs a connection, because it opens the visit on the server.',
  },
};
