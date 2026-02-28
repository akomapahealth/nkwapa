export const SYNC_OPERATION = {
  UPSERT: 'UPSERT',
  DELETE: 'DELETE',
} as const;

export type SyncOperationType =
  (typeof SYNC_OPERATION)[keyof typeof SYNC_OPERATION];

export interface SyncMutationDto {
  id: string;
  entityType: string;
  entityId: string;
  operation: SyncOperationType;
  clinicId: string;
  payloadJson?: Record<string, unknown>;
  idempotencyKey: string;
  createdAt?: string;
}
