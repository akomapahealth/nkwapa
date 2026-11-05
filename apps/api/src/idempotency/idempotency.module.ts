import { Module } from '@nestjs/common';
import { IdempotencyRetentionSweep } from './idempotency-retention.sweep';

/** The purge. The interceptor itself is registered in PrismaModule, right after the RLS one. */
@Module({ providers: [IdempotencyRetentionSweep] })
export class IdempotencyModule {}
