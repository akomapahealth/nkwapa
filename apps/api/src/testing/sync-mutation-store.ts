/**
 * An in-memory `SyncMutation` table for replay specs.
 *
 * The sync specs used to stub `findUnique` with a fixed answer, which proves a stored outcome is
 * read but never that the outcome a first push records is the one a second push gets back. This
 * keeps what each call wrote, keyed the way the database is (`clinicId` + `idempotencyKey`), and
 * refuses a second record for one key as the unique index does.
 */

import { Prisma } from '@prisma/client';

export interface StoredSyncMutation {
  clinicId: string;
  idempotencyKey: string;
  entityType: string;
  entityId: string;
  status: string;
  conflictType: string | null;
  conflictDetailsJson: string | null;
}

interface MutationKey {
  clinicId_idempotencyKey: { clinicId: string; idempotencyKey: string };
}

const keyOf = ({ clinicId_idempotencyKey: key }: MutationKey) =>
  `${key.clinicId}|${key.idempotencyKey}`;

export function createSyncMutationStore() {
  const records = new Map<string, StoredSyncMutation>();

  const syncMutation = {
    findUnique: jest.fn(
      async ({ where }: { where: MutationKey }) => records.get(keyOf(where)) ?? null,
    ),
    create: jest.fn(async ({ data }: { data: Partial<StoredSyncMutation> }) => {
      const key = `${data.clinicId}|${data.idempotencyKey}`;
      if (records.has(key)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const record: StoredSyncMutation = {
        clinicId: String(data.clinicId),
        idempotencyKey: String(data.idempotencyKey),
        entityType: String(data.entityType),
        entityId: String(data.entityId),
        status: String(data.status),
        conflictType: data.conflictType ?? null,
        conflictDetailsJson: data.conflictDetailsJson ?? null,
      };
      records.set(key, record);
      return record;
    }),
    delete: jest.fn(async ({ where }: { where: MutationKey }) => {
      const record = records.get(keyOf(where));
      records.delete(keyOf(where));
      return record;
    }),
  };

  return { records, syncMutation };
}
