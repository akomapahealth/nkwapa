import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { UserIdentitySyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  KeycloakAdminService,
  type IdentityAccessResult,
} from '../keycloak/keycloak-admin.service';
import { redactLogValue } from '../common/redaction';

export const IDENTITY_SYNC_QUEUE = 'identity-sync';
export const IDENTITY_SYNC_JOB = 'sync-identity';

/**
 * How long after the request the first attempt runs.
 *
 * The job is queued from inside the request's transaction, so it can start before that
 * transaction commits and read the user as they were. A short delay makes that rare; the
 * settle check in `processSync` makes it harmless.
 */
export const IDENTITY_SYNC_DELAY_MS = 2_000;

/** Attempts in total, across both waiting for the request to settle and retrying Keycloak. */
export const IDENTITY_SYNC_MAX_ATTEMPTS = 6;

/**
 * Attempts during which a user whose state does not yet match is assumed not to have committed.
 *
 * The request transaction is bounded by Prisma's timeout, so by the third attempt (a few seconds
 * plus the first two backoffs) it has either committed or rolled back. A mismatch after that
 * means a later change superseded this one, and that change queued a job of its own.
 */
const SETTLE_ATTEMPTS = 3;

export interface IdentitySyncJobData {
  userId: string;
  /** What Keycloak should end up saying. Also what `User.isActive` must still say. */
  expectedActive: boolean;
  /** The admin who made the change, so the audit event names them rather than the system. */
  actorUserId: string;
  requestId?: string;
}

export interface IdentitySyncState {
  status: UserIdentitySyncStatus;
  failureReason: string | null;
}

/** Thrown to have BullMQ try again. Carries a code, never anything identifying. */
export class IdentitySyncRetryError extends Error {
  constructor(readonly reason: string) {
    super(`Identity sync will be retried: ${reason}`);
    this.name = 'IdentitySyncRetryError';
  }
}

/**
 * Bring a user's Keycloak identity in line with their Nkwapa access. Issue #126.
 *
 * Two halves, deliberately split across a commit. The local block (`User.isActive`) is written in
 * the request, which is the half that matters for safety and must never wait on Keycloak. The
 * identity half runs here afterwards, because the request is one Postgres transaction with a
 * bounded lifetime: a slow Keycloak inside it could time the transaction out and roll the
 * deactivation back, which is the one outcome this must never have.
 *
 * The job converges rather than commands. It checks that the user still says what it was queued
 * to apply, applies that, and records the result on the user, so a deactivation followed quickly
 * by a reactivation ends in the right place whichever job runs first.
 */
@Injectable()
export class IdentitySyncService {
  private readonly logger = new Logger(IdentitySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly keycloakAdminService: KeycloakAdminService,
    private readonly tenantContext: JobTenantContextRunner,
    @InjectQueue(IDENTITY_SYNC_QUEUE) private readonly queue: Queue<IdentitySyncJobData>,
  ) {}

  /**
   * Called inside the request, after the local write. Marks the user PENDING and queues the job.
   *
   * A Redis failure degrades to a visible FAILED state rather than an error: the local change
   * stands, and the admin page offers a retry. Safe to catch, because Redis throws outside
   * Postgres and leaves the request's transaction healthy.
   */
  async requestSync(data: IdentitySyncJobData): Promise<IdentitySyncState> {
    await this.prisma.user.update({
      where: { id: data.userId },
      data: {
        identitySyncStatus: 'PENDING',
        identitySyncRequestedAt: new Date(),
        identitySyncFailureReason: null,
      },
    });

    try {
      await this.queue.add(IDENTITY_SYNC_JOB, data, {
        delay: IDENTITY_SYNC_DELAY_MS,
        attempts: IDENTITY_SYNC_MAX_ATTEMPTS,
        backoff: { type: 'custom' },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return { status: 'PENDING', failureReason: null };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'Identity sync could not be queued',
          error: redactLogValue(error),
        }),
      );
      await this.prisma.user.update({
        where: { id: data.userId },
        data: { identitySyncStatus: 'FAILED', identitySyncFailureReason: 'QUEUE_UNAVAILABLE' },
      });
      return { status: 'FAILED', failureReason: 'QUEUE_UNAVAILABLE' };
    }
  }

  /**
   * Run one attempt. Throws `IdentitySyncRetryError` when another attempt should follow.
   *
   * Three short steps, and only the middle one talks to Keycloak, outside any transaction, for
   * the same reason the whole thing is a job: a database transaction must not be held open
   * across a call that can take seconds.
   */
  async processSync(
    data: IdentitySyncJobData,
    attempt: { attemptsMade: number; maxAttempts: number; jobId?: string | number },
  ): Promise<'APPLIED' | 'SUPERSEDED' | 'GONE' | 'FINISHED_WITH_FAILURE'> {
    const context = {
      queueName: IDENTITY_SYNC_QUEUE,
      jobId: attempt.jobId,
      resourceId: data.userId,
      userId: data.actorUserId,
    };
    const thisAttempt = attempt.attemptsMade + 1;

    const user = await this.tenantContext.runSystemJob(
      { ...context, systemReason: 'Read a user whose sign-in identity is being synced' },
      (tx) =>
        tx.user.findUnique({
          where: { id: data.userId },
          select: { isActive: true, keycloakSub: true },
        }),
    );
    if (!user) {
      return 'GONE';
    }
    if (user.isActive !== data.expectedActive) {
      if (thisAttempt < SETTLE_ATTEMPTS) {
        throw new IdentitySyncRetryError('REQUEST_NOT_SETTLED');
      }
      return 'SUPERSEDED';
    }

    const result = await this.keycloakAdminService.setIdentityAccess(
      user.keycloakSub,
      data.expectedActive,
    );
    const willRetry =
      result.outcome === 'FAILED' && result.retryable && thisAttempt < attempt.maxAttempts;
    const status = willRetry ? 'PENDING' : this.statusFor(result, data.expectedActive);

    await this.tenantContext.runSystemJob(
      { ...context, systemReason: 'Record the outcome of a sign-in identity sync' },
      async (tx) => {
        // Guarded on the state it applied. If the user changed while Keycloak was answering, the
        // newer change's job owns the record, and writing this one would describe the past.
        const recorded = await tx.user.updateMany({
          where: { id: data.userId, isActive: data.expectedActive },
          data: {
            identitySyncStatus: status,
            identitySyncedAt: new Date(),
            identitySyncFailureReason: status === 'IN_SYNC' ? null : result.failureReason,
          },
        });
        if (willRetry || recorded.count === 0) {
          return;
        }
        await this.auditService.logWrite({
          clinicId: null,
          actorUserId: data.actorUserId,
          action: data.expectedActive ? 'USER.IDENTITY.ENABLE' : 'USER.IDENTITY.DISABLE',
          entityType: 'User',
          entityId: data.userId,
          afterJson: JSON.stringify({
            status,
            outcome: result.outcome,
            sessionsEnded: result.sessionsEnded,
            failureReason: result.failureReason,
            attempts: thisAttempt,
          }),
          requestId: data.requestId,
        });
      },
    );

    if (willRetry) {
      throw new IdentitySyncRetryError(result.failureReason ?? 'KEYCLOAK_ADMIN_REQUEST_FAILED');
    }
    return status === 'IN_SYNC' ? 'APPLIED' : 'FINISHED_WITH_FAILURE';
  }

  /**
   * An identity that does not exist cannot sign in, which is exactly what a deactivation wants
   * and exactly what a reactivation does not.
   */
  private statusFor(result: IdentityAccessResult, expectedActive: boolean): UserIdentitySyncStatus {
    switch (result.outcome) {
      case 'APPLIED':
        return 'IN_SYNC';
      case 'NOT_FOUND':
        return expectedActive ? 'FAILED' : 'IN_SYNC';
      case 'SKIPPED':
        return 'SKIPPED';
      default:
        return 'FAILED';
    }
  }
}
