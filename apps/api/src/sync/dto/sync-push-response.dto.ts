export const SYNC_MUTATION_RESULT_STATUS = {
  APPLIED: 'APPLIED',
  CONFLICT: 'CONFLICT',
  ERROR: 'ERROR',
} as const;

export type SyncMutationResultStatus =
  (typeof SYNC_MUTATION_RESULT_STATUS)[keyof typeof SYNC_MUTATION_RESULT_STATUS];

export interface SyncMutationResultDto {
  id: string;
  status: SyncMutationResultStatus;
  conflictType?: string;
  conflictDetails?: Record<string, unknown>;
  /**
   * Whether replaying this exact mutation could still succeed.
   *
   * A client keeps a retryable row queued and tries again; a non-retryable one needs the clinician
   * to repair or discard it. Without the distinction every failure looked permanent, so one bad
   * row wedged the whole outbox.
   */
  retryable?: boolean;
}

export interface SyncPushResponseDto {
  results: SyncMutationResultDto[];
}
