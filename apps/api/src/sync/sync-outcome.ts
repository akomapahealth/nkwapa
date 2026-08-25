import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { redactLogValue } from '../common/redaction';
import { SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';
import type { SyncMutationResultDto } from './dto/sync-push-response.dto';

/**
 * Conflicts that arise from server state a replay cannot change.
 *
 * These are cached against the idempotency key: replaying the identical mutation is guaranteed to
 * reach the same answer, so re-running the handler would only repeat the work. Everything else --
 * a permission that may be granted, a feature flag that may be turned on, a referenced encounter
 * that may arrive in a later pull, a transient database error -- must stay retryable, or a client
 * that keeps its outbox row can never drain it even after the cause is fixed.
 */
export const DETERMINISTIC_CONFLICT_TYPES: ReadonlySet<string> = new Set([
  'CONFLICT_FINALIZED',
  'DUPLICATE_NATIONAL_ID',
  'MEDICAL_HISTORY_CONFLICT',
  'UNSUPPORTED_STATUS_TRANSITION',
]);

export interface SyncOutcome {
  status: SyncMutationResultDto['status'];
  conflictType: string;
  conflictDetails: Record<string, unknown>;
  /** Whether replaying this exact mutation could ever produce a different answer. */
  retryable: boolean;
}

/** Fields a conflict payload may carry back to the client. */
const ALLOWED_CONFLICT_KEYS = [
  'code',
  'existingStatus',
  'requestedStatus',
  'currentRevisionId',
  'expectedRevisionId',
  'existingPatientId',
  'patientCode',
] as const;

/**
 * Build the payload a client is told about, from an allow-list.
 *
 * The raw exception response used to be stored verbatim and echoed back. A handler that starts
 * including a patient name in its message would then have leaked it into the sync response and
 * into SyncMutation.conflictDetailsJson without anyone changing the sync code.
 */
export function safeConflictDetails(
  response: Record<string, unknown> | null,
  fallbackMessage: string,
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: redactLogValue(
      typeof response?.message === 'string' ? response.message : fallbackMessage,
    ),
  };

  for (const key of ALLOWED_CONFLICT_KEYS) {
    const value = response?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      details[key] = value;
    }
  }

  if (Array.isArray(response?.fieldErrors)) {
    details.fieldErrors = (response.fieldErrors as unknown[]).slice(0, 20).map((entry) => {
      const item = entry as { field?: unknown; message?: unknown };
      return {
        field: String(item?.field ?? '').slice(0, 80),
        message: redactLogValue(String(item?.message ?? '')),
      };
    });
  }

  return details;
}

export function classifySyncFailure(err: unknown, entityType: string): SyncOutcome {
  const fallbackMessage = err instanceof Error ? err.message : String(err);
  const response =
    err instanceof HttpException && typeof err.getResponse() === 'object'
      ? (err.getResponse() as Record<string, unknown>)
      : null;

  const isConflict = err instanceof ConflictException;
  const conflictType = response?.code
    ? String(response.code)
    : isConflict && entityType === 'medical_history_revision'
      ? 'MEDICAL_HISTORY_CONFLICT'
      : isConflict
        ? 'APPLICATION_CONFLICT'
        : err instanceof ForbiddenException
          ? 'FORBIDDEN'
          : err instanceof HttpException
            ? 'APPLICATION_REJECTED'
            : 'APPLICATION_ERROR';

  return {
    status: isConflict ? SYNC_MUTATION_RESULT_STATUS.CONFLICT : SYNC_MUTATION_RESULT_STATUS.ERROR,
    conflictType,
    conflictDetails: safeConflictDetails(response, fallbackMessage),
    retryable: !isTerminalConflictType(conflictType, isConflict),
  };
}

function isTerminalConflictType(conflictType: string, isConflict: boolean): boolean {
  return isConflict && DETERMINISTIC_CONFLICT_TYPES.has(conflictType);
}

/** Whether a recorded outcome may short-circuit a later replay of the same idempotency key. */
export function isTerminalOutcome(status: string, conflictType: string | null): boolean {
  if (status === SYNC_MUTATION_RESULT_STATUS.APPLIED) return true;
  if (status !== SYNC_MUTATION_RESULT_STATUS.CONFLICT) return false;
  return conflictType !== null && DETERMINISTIC_CONFLICT_TYPES.has(conflictType);
}
