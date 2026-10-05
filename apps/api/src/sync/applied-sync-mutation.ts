import { Prisma, SyncMutationStatus, SyncOperation } from '@prisma/client';

/** The idempotency record a replayed write leaves behind once it has applied. */
export interface AppliedSyncMutationRef {
  entityType: string;
  entityId: string;
  idempotencyKey: string;
}

/**
 * Record that a replayed mutation applied.
 *
 * Pass the transaction the write ran in. A record written after the transaction commits leaves a
 * window where the write exists but the idempotency key does not, and a retry in that window runs
 * the handler a second time.
 */
export async function recordAppliedSyncMutation(
  client: Pick<Prisma.TransactionClient, 'syncMutation'>,
  clinicId: string,
  ref: AppliedSyncMutationRef,
): Promise<void> {
  await client.syncMutation.create({
    data: {
      clinicId,
      entityType: ref.entityType,
      entityId: ref.entityId,
      operation: SyncOperation.UPSERT,
      idempotencyKey: ref.idempotencyKey,
      status: SyncMutationStatus.APPLIED,
    },
  });
}
