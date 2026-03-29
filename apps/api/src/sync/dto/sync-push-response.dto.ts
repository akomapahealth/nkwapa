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
}

export interface SyncPushResponseDto {
  results: SyncMutationResultDto[];
}
