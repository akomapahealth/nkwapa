import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';
import { encryptChatContent } from './chat-crypto';

export const CHAT_ENCRYPTION_BACKFILL_JOB = 'encrypt-legacy-chat-messages';
const BATCH = 500;

/**
 * Seals chat messages written before encryption at rest, a batch an hour until none are left.
 *
 * New messages are sealed on write, so this only ever shrinks. If it cannot run, old messages
 * stay readable plaintext in the database, as they were before; nothing is lost or hidden.
 */
@Injectable()
export class ChatEncryptionBackfillSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = CHAT_ENCRYPTION_BACKFILL_JOB;
  readonly everyMs = 60 * 60 * 1000;
  private readonly logger = new Logger(ChatEncryptionBackfillSweep.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    const sealed = await this.tenantContext.runSystemJob(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: CHAT_ENCRYPTION_BACKFILL_JOB,
        systemReason: 'Encrypt chat messages stored before encryption at rest',
      },
      (client) => sealLegacyMessages(client),
    );
    if (sealed > 0) {
      this.logger.log(JSON.stringify({ message: 'Legacy chat messages encrypted', sealed }));
    }
  }
}

/** Seal one batch; returns how many rows it sealed. */
export async function sealLegacyMessages(
  client: Prisma.TransactionClient,
  batch = BATCH,
): Promise<number> {
  const rows = await client.message.findMany({
    where: { encrypted: false },
    select: { id: true, clinicId: true, conversationId: true, content: true },
    take: batch,
  });
  for (const row of rows) {
    // Conditional on still being plaintext, so a rerun never seals a row twice.
    await client.message.updateMany({
      where: { id: row.id, encrypted: false },
      data: { content: encryptChatContent(row.content, row), encrypted: true },
    });
  }
  return rows.length;
}
