import {
  IDENTITY_SYNC_DELAY_MS,
  IDENTITY_SYNC_JOB,
  IDENTITY_SYNC_MAX_ATTEMPTS,
  IdentitySyncRetryError,
  IdentitySyncService,
  type IdentitySyncJobData,
} from './identity-sync.service';
import { identitySyncBackoff } from './identity-sync.processor';
import type { IdentityAccessResult } from '../keycloak/keycloak-admin.service';

const USER_ID = 'user-1';
const SUB = 'kc-sub-1';

function access(overrides: Partial<IdentityAccessResult> = {}): IdentityAccessResult {
  return {
    outcome: 'APPLIED',
    sessionsEnded: true,
    retryable: false,
    failureReason: null,
    ...overrides,
  };
}

describe('IdentitySyncService', () => {
  let tx: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let prisma: { user: { update: jest.Mock } };
  let audit: { logWrite: jest.Mock };
  let keycloak: { setIdentityAccess: jest.Mock };
  let queue: { add: jest.Mock };
  let tenantContext: { runSystemJob: jest.Mock };
  let service: IdentitySyncService;

  const disable: IdentitySyncJobData = {
    userId: USER_ID,
    expectedActive: false,
    actorUserId: 'admin-1',
    requestId: 'req-1',
  };
  const firstAttempt = { attemptsMade: 0, maxAttempts: IDENTITY_SYNC_MAX_ATTEMPTS, jobId: 'j1' };

  beforeEach(() => {
    tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ isActive: false, keycloakSub: SUB }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
    keycloak = { setIdentityAccess: jest.fn().mockResolvedValue(access()) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'j1' }) };
    tenantContext = {
      runSystemJob: jest.fn(async (_ctx: unknown, run: (client: typeof tx) => unknown) => run(tx)),
    };
    service = new IdentitySyncService(
      prisma as never,
      audit as never,
      keycloak as never,
      tenantContext as never,
      queue as never,
    );
  });

  describe('requesting', () => {
    it('marks the user pending and queues a delayed, retried job', async () => {
      await expect(service.requestSync(disable)).resolves.toEqual({
        status: 'PENDING',
        failureReason: null,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: expect.objectContaining({
          identitySyncStatus: 'PENDING',
          identitySyncFailureReason: null,
        }),
      });
      expect(queue.add).toHaveBeenCalledWith(
        IDENTITY_SYNC_JOB,
        disable,
        expect.objectContaining({
          delay: IDENTITY_SYNC_DELAY_MS,
          attempts: IDENTITY_SYNC_MAX_ATTEMPTS,
          backoff: { type: 'custom' },
        }),
      );
    });

    // Redis is not allowed to turn a deactivation into an error.
    it('degrades to a visible failure when the queue is down', async () => {
      queue.add.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.requestSync(disable)).resolves.toEqual({
        status: 'FAILED',
        failureReason: 'QUEUE_UNAVAILABLE',
      });
      expect(prisma.user.update).toHaveBeenLastCalledWith({
        where: { id: USER_ID },
        data: { identitySyncStatus: 'FAILED', identitySyncFailureReason: 'QUEUE_UNAVAILABLE' },
      });
    });
  });

  describe('processing', () => {
    it('disables the identity, ends its sessions, and records and audits the result', async () => {
      await expect(service.processSync(disable, firstAttempt)).resolves.toBe('APPLIED');

      expect(keycloak.setIdentityAccess).toHaveBeenCalledWith(SUB, false);
      // Guarded on the state it applied, so a newer change is never overwritten.
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID, isActive: false },
        data: expect.objectContaining({
          identitySyncStatus: 'IN_SYNC',
          identitySyncFailureReason: null,
        }),
      });
      const [entry] = audit.logWrite.mock.calls[0];
      expect(entry).toMatchObject({
        action: 'USER.IDENTITY.DISABLE',
        actorUserId: 'admin-1',
        clinicId: null,
        entityId: USER_ID,
      });
      expect(JSON.parse(entry.afterJson)).toMatchObject({
        outcome: 'APPLIED',
        sessionsEnded: true,
      });
    });

    // Keycloak is never called inside a transaction: that is the whole point of the job.
    it('talks to Keycloak between the two short transactions, not inside either', async () => {
      let insideTransaction = false;
      tenantContext.runSystemJob.mockImplementation(async (_ctx, run) => {
        insideTransaction = true;
        try {
          return await run(tx);
        } finally {
          insideTransaction = false;
        }
      });
      keycloak.setIdentityAccess.mockImplementation(async () => {
        expect(insideTransaction).toBe(false);
        return access();
      });

      await service.processSync(disable, firstAttempt);
      expect(keycloak.setIdentityAccess).toHaveBeenCalled();
    });

    it('re-enables on a reactivation, with no sessions to end', async () => {
      tx.user.findUnique.mockResolvedValue({ isActive: true, keycloakSub: SUB });
      keycloak.setIdentityAccess.mockResolvedValue(access({ sessionsEnded: false }));

      await service.processSync({ ...disable, expectedActive: true }, firstAttempt);

      expect(keycloak.setIdentityAccess).toHaveBeenCalledWith(SUB, true);
      expect(audit.logWrite.mock.calls[0][0].action).toBe('USER.IDENTITY.ENABLE');
    });

    /*
      The job is queued inside the request's transaction, so it can run before that commits and
      see the user as they were. It waits rather than acting on the old state.
    */
    it('waits for the request to settle before acting', async () => {
      tx.user.findUnique.mockResolvedValue({ isActive: true, keycloakSub: SUB });

      await expect(service.processSync(disable, firstAttempt)).rejects.toBeInstanceOf(
        IdentitySyncRetryError,
      );
      expect(keycloak.setIdentityAccess).not.toHaveBeenCalled();
    });

    // A later reactivation queued its own job, which owns the outcome.
    it('stands down once a later change has superseded it', async () => {
      tx.user.findUnique.mockResolvedValue({ isActive: true, keycloakSub: SUB });

      await expect(
        service.processSync(disable, { ...firstAttempt, attemptsMade: 2 }),
      ).resolves.toBe('SUPERSEDED');
      expect(keycloak.setIdentityAccess).not.toHaveBeenCalled();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('retries a transient Keycloak failure, showing it as pending with the reason', async () => {
      keycloak.setIdentityAccess.mockResolvedValue(
        access({
          outcome: 'FAILED',
          retryable: true,
          sessionsEnded: false,
          failureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
        }),
      );

      await expect(service.processSync(disable, firstAttempt)).rejects.toBeInstanceOf(
        IdentitySyncRetryError,
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identitySyncStatus: 'PENDING',
            identitySyncFailureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
          }),
        }),
      );
      // Only the final outcome is audited, not every blip on the way.
      expect(audit.logWrite).not.toHaveBeenCalled();
    });

    it('settles on FAILED when the retries run out, and audits it', async () => {
      keycloak.setIdentityAccess.mockResolvedValue(
        access({
          outcome: 'FAILED',
          retryable: true,
          sessionsEnded: false,
          failureReason: 'KEYCLOAK_ADMIN_UNREACHABLE',
        }),
      );

      await expect(
        service.processSync(disable, {
          ...firstAttempt,
          attemptsMade: IDENTITY_SYNC_MAX_ATTEMPTS - 1,
        }),
      ).resolves.toBe('FINISHED_WITH_FAILURE');
      expect(tx.user.updateMany.mock.calls[0][0].data.identitySyncStatus).toBe('FAILED');
      expect(audit.logWrite).toHaveBeenCalledTimes(1);
    });

    it('does not retry a refusal that will not change', async () => {
      keycloak.setIdentityAccess.mockResolvedValue(
        access({
          outcome: 'FAILED',
          retryable: false,
          sessionsEnded: false,
          failureReason: 'KEYCLOAK_ADMIN_REQUEST_FAILED',
        }),
      );

      await expect(service.processSync(disable, firstAttempt)).resolves.toBe(
        'FINISHED_WITH_FAILURE',
      );
    });

    it.each([
      [false, 'IN_SYNC'],
      [true, 'FAILED'],
    ])('reads a missing identity as expectedActive=%s -> %s', async (expectedActive, status) => {
      tx.user.findUnique.mockResolvedValue({ isActive: expectedActive, keycloakSub: SUB });
      keycloak.setIdentityAccess.mockResolvedValue(
        access({ outcome: 'NOT_FOUND', sessionsEnded: false, failureReason: 'IDENTITY_NOT_FOUND' }),
      );

      await service.processSync({ ...disable, expectedActive }, firstAttempt);

      expect(tx.user.updateMany.mock.calls[0][0].data.identitySyncStatus).toBe(status);
    });

    it('records SKIPPED on a deployment without the service account', async () => {
      keycloak.setIdentityAccess.mockResolvedValue(
        access({
          outcome: 'SKIPPED',
          sessionsEnded: false,
          failureReason: 'KEYCLOAK_ADMIN_UNCONFIGURED',
        }),
      );

      await service.processSync(disable, firstAttempt);

      expect(tx.user.updateMany.mock.calls[0][0].data).toMatchObject({
        identitySyncStatus: 'SKIPPED',
        identitySyncFailureReason: 'KEYCLOAK_ADMIN_UNCONFIGURED',
      });
    });

    it('writes no audit event when the user changed while Keycloak was answering', async () => {
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await service.processSync(disable, firstAttempt);

      expect(audit.logWrite).not.toHaveBeenCalled();
    });

    it('does nothing for a user that no longer exists', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(service.processSync(disable, firstAttempt)).resolves.toBe('GONE');
      expect(keycloak.setIdentityAccess).not.toHaveBeenCalled();
    });
  });

  it('backs off fast first, then patiently', () => {
    expect(identitySyncBackoff(1)).toBe(3_000);
    expect(identitySyncBackoff(2)).toBe(10_000);
    expect(identitySyncBackoff(99)).toBe(120_000);
  });
});
