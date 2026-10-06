import type { Prisma } from '@prisma/client';

type RawClient = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/**
 * Serialize work on one key until the surrounding transaction ends.
 *
 * A Postgres advisory lock scoped to the transaction: a second transaction asking for the same key
 * waits until the first commits or rolls back, then sees what the first wrote. Use it where a
 * read-then-write must not interleave with itself, such as a replay checking its idempotency
 * record or a check-in checking for an open one. Outside a transaction the lock is released as soon
 * as the statement ends, so it protects nothing; every caller here runs inside one.
 */
export async function lockForTransaction(client: RawClient, key: string): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * Take the same lock without waiting. `false` means another transaction holds the key right now.
 *
 * For work that should be done once rather than queued behind itself: a duplicate delivery of a
 * job that finds the lock taken can stand down, because the holder is already doing the work.
 */
export async function tryLockForTransaction(client: RawClient, key: string): Promise<boolean> {
  const [row] = await client.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
  return row?.locked === true;
}
