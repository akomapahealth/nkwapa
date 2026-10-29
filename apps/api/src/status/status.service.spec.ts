import { StatusService } from './status.service';
import { StatusAdminGuard } from './status.controller';
import { UserRole } from '@prisma/client';
import { Queue } from 'bullmq';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    getJobCounts: jest.fn().mockResolvedValue({ failed: 0, waiting: 0 }),
    getJobs: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

const originalFetch = global.fetch;
const originalIssuer = process.env.KEYCLOAK_ISSUER;
const originalCors = process.env.CORS_ALLOWED_ORIGINS;
const originalSha = process.env.RENDER_GIT_COMMIT;
const originalNodeEnv = process.env.NODE_ENV;

function setup(
  options: {
    db?: Promise<unknown>;
    redis?: boolean;
    emailFailed?: boolean;
    emailReadiness?: string;
    webSha?: string;
  } = {},
) {
  process.env.KEYCLOAK_ISSUER = 'https://auth.example/realms/nkwapa';
  process.env.CORS_ALLOWED_ORIGINS = 'https://web.example';
  process.env.RENDER_GIT_COMMIT = 'abc';
  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: object) => Promise<unknown>) =>
        options.db ??
        callback({
          $executeRaw: jest.fn().mockResolvedValue(0),
          $queryRaw: jest.fn().mockResolvedValue([1]),
        }),
    ),
  };
  const redis = {
    client: {},
    isReady: () => options.redis !== false,
    ping: jest.fn().mockResolvedValue(options.redis !== false),
  };
  const email = {
    getStatus: () => ({
      readiness: options.emailReadiness ?? 'smtp',
      provider: 'secret-host',
      fromAddress: 'private@example.com',
    }),
    getLatestSend: () =>
      options.emailFailed ? { success: false, error: 'smtp.secret-host' } : null,
  };
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('openid-configuration')
        ? { issuer: process.env.KEYCLOAK_ISSUER }
        : { sha: options.webSha ?? 'abc', hostname: 'secret-web-host' },
  })) as never;
  return {
    service: new StatusService(prisma as never, redis as never, email as never),
    prisma,
    redis,
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  if (originalIssuer === undefined) delete process.env.KEYCLOAK_ISSUER;
  else process.env.KEYCLOAK_ISSUER = originalIssuer;
  if (originalCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
  else process.env.CORS_ALLOWED_ORIGINS = originalCors;
  if (originalSha === undefined) delete process.env.RENDER_GIT_COMMIT;
  else process.env.RENDER_GIT_COMMIT = originalSha;
  process.env.NODE_ENV = originalNodeEnv;
  jest.useRealTimers();
});

describe('StatusService', () => {
  it('coalesces concurrent requests and never serializes private details publicly', async () => {
    const { service, prisma } = setup({ emailFailed: true });
    const [first, second] = await Promise.all([service.publicStatus(), service.publicStatus()]);
    expect(first).toBe(second);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('degraded');
    expect(JSON.stringify(first)).not.toMatch(/secret-host|private@example.com|reminders/);
    expect(JSON.stringify(await service.details())).toMatch(/smtp.secret-host/);
  });

  it('treats database failure as outage and Redis failure as degradation', async () => {
    const { service } = setup({ db: Promise.reject(new Error('db.internal.host')), redis: false });
    const result = await service.publicStatus();
    expect(result.status).toBe('outage');
    expect(result.components.find((item) => item.name === 'database')).toMatchObject({
      state: 'outage',
      reason: 'UNAVAILABLE',
    });
    expect(result.components.find((item) => item.name === 'redis')?.state).toBe('degraded');
    expect(JSON.stringify(result)).not.toContain('db.internal.host');
  });

  it('degrades on version skew', async () => {
    const { service } = setup({ webSha: 'old' });
    const result = await service.publicStatus();
    expect(result.components.find((item) => item.name === 'web')).toMatchObject({
      state: 'degraded',
      reason: 'VERSION_MISMATCH',
    });
  });

  function lastQueues() {
    return (Queue as unknown as jest.Mock).mock.results.slice(-4).map((result) => result.value);
  }

  it('stays operational with old failed jobs, which most queues keep forever', async () => {
    const { service } = setup();
    lastQueues()[0].getJobs.mockImplementation(async (types: string[]) =>
      types[0] === 'failed' ? [{ timestamp: 0, finishedOn: Date.now() - 60 * 60_000 }] : [],
    );
    const result = await service.publicStatus();
    expect(result.components.find((item) => item.name === 'queues')).toMatchObject({
      state: 'operational',
      reason: 'OK',
    });
  });

  it('degrades on a job that failed in the last five minutes', async () => {
    const { service } = setup();
    const [reminders] = lastQueues();
    reminders.getJobs.mockImplementation(async (types: string[]) =>
      types[0] === 'failed'
        ? [{ timestamp: Date.now() - 60 * 60_000, finishedOn: Date.now() - 60_000 }]
        : [],
    );
    const result = await service.publicStatus();
    expect(result.components.find((item) => item.name === 'queues')).toMatchObject({
      state: 'degraded',
      reason: 'RECENT_FAILURES',
    });
    // Newest failure first: the check must not read the oldest one.
    expect(reminders.getJobs).toHaveBeenCalledWith(['failed'], 0, 0, false);
  });

  it('degrades when a job has waited more than five minutes', async () => {
    const { service } = setup();
    lastQueues()[0].getJobs.mockImplementation(async (types: string[]) =>
      types[0] === 'waiting' ? [{ timestamp: Date.now() - 6 * 60_000 }] : [],
    );
    const result = await service.publicStatus();
    expect(result.components.find((item) => item.name === 'queues')).toMatchObject({
      state: 'degraded',
      reason: 'STALE_JOBS',
    });
    expect(JSON.stringify(result)).not.toContain('reminders');
  });

  it('degrades on the fake email provider in production only', async () => {
    process.env.NODE_ENV = 'production';
    const production = await setup({ emailReadiness: 'fake' }).service.publicStatus();
    expect(production.components.find((item) => item.name === 'email')).toMatchObject({
      state: 'degraded',
      reason: 'FAKE_PROVIDER',
    });
    process.env.NODE_ENV = 'test';
    const local = await setup({ emailReadiness: 'fake' }).service.publicStatus();
    expect(local.components.find((item) => item.name === 'email')?.state).toBe('operational');
  });

  it('bounds a hung database check', async () => {
    jest.useFakeTimers();
    const { service } = setup({ db: new Promise(() => undefined) });
    const resultPromise = service.publicStatus();
    await jest.advanceTimersByTimeAsync(3_100);
    const result = await resultPromise;
    expect(result.components.find((item) => item.name === 'database')).toMatchObject({
      state: 'outage',
      reason: 'TIMEOUT',
    });
  });
});

describe('StatusAdminGuard', () => {
  const guard = new StatusAdminGuard();
  const context = (roles: object[]) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }) }) as never;
  it('requires a global System Admin seat', () => {
    expect(guard.canActivate(context([{ role: UserRole.SYSTEM_ADMIN, clinicId: null }]))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(context([{ role: UserRole.SYSTEM_ADMIN, clinicId: 'clinic' }])),
    ).toThrow();
    expect(() =>
      guard.canActivate(context([{ role: UserRole.MANAGER, clinicId: null }])),
    ).toThrow();
  });
});
