import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailStatusService } from '../notifications/email/email-status.service';
import { getAllowedCorsOrigins } from '../common/api-config';

export type ComponentState = 'operational' | 'degraded' | 'outage';
type ComponentName = 'database' | 'redis' | 'queues' | 'email' | 'auth' | 'web';
export interface PublicComponent {
  name: ComponentName;
  state: ComponentState;
  latencyMs: number;
  checkedAt: string;
  reason: string;
}
export interface PublicStatus {
  status: ComponentState;
  checkedAt: string;
  apiSha: string | null;
  webSha: string | null;
  components: PublicComponent[];
}
export interface Detail extends PublicComponent {
  error?: string;
  detail?: unknown;
}

const QUEUE_NAMES = ['reminders', 'identity-sync', 'maintenance', 'research-exports'] as const;
const CACHE_MS = 30_000;
const SLOW_MS = 1_500;
const STALE_JOB_MS = 5 * 60_000;

async function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('check timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Injectable()
export class StatusService implements OnModuleDestroy {
  private cached: { public: PublicStatus; details: Detail[]; expires: number } | null = null;
  private pending: Promise<{ public: PublicStatus; details: Detail[]; expires: number }> | null =
    null;
  private readonly queues: Queue[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailStatusService,
  ) {
    this.queues = QUEUE_NAMES.map((name) => new Queue(name, { connection: redis.client }));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues.map((queue) => queue.close()));
  }

  async publicStatus(): Promise<PublicStatus> {
    return (await this.snapshot()).public;
  }

  async details(): Promise<{ public: PublicStatus; components: Detail[] }> {
    const snapshot = await this.snapshot();
    return { public: snapshot.public, components: snapshot.details };
  }

  private async snapshot() {
    if (this.cached && Date.now() < this.cached.expires) return this.cached;
    if (!this.pending) {
      this.pending = this.run().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  private async check(
    name: ComponentName,
    critical: boolean,
    work: () => Promise<{ reason?: string; detail?: unknown; state?: ComponentState }>,
  ): Promise<Detail> {
    const start = Date.now();
    const checkedAt = new Date(start).toISOString();
    try {
      const result = await deadline(work(), 3_000);
      const latencyMs = Date.now() - start;
      return {
        name,
        state: result.state ?? (latencyMs > SLOW_MS ? 'degraded' : 'operational'),
        latencyMs,
        checkedAt,
        reason: result.reason ?? (latencyMs > SLOW_MS ? 'SLOW' : 'OK'),
        ...(result.detail === undefined ? {} : { detail: result.detail }),
      };
    } catch (error) {
      return {
        name,
        state: critical ? 'outage' : 'degraded',
        latencyMs: Date.now() - start,
        checkedAt,
        reason:
          error instanceof Error && error.message === 'check timed out' ? 'TIMEOUT' : 'UNAVAILABLE',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async run() {
    const checks = await Promise.all([
      this.check('database', true, async () => {
        await deadline(
          this.prisma.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
              await tx.$queryRaw`SELECT 1`;
            },
            { timeout: 2_500 },
          ),
          2_800,
        );
        return {};
      }),
      this.check('redis', false, async () => {
        if (!(await this.redis.ping())) throw new Error('Redis ping failed');
        return {};
      }),
      this.check('queues', false, async () => {
        if (!this.redis.isReady()) throw new Error('Redis unavailable');
        const detail = await Promise.all(
          this.queues.map(async (queue) => {
            const counts = await queue.getJobCounts('failed', 'waiting');
            const [failed, waiting] = await Promise.all([
              queue.getJobs(['failed'], 0, 0, true),
              queue.getJobs(['waiting'], 0, 0, true),
            ]);
            const stale = [...failed, ...waiting].some(
              (job) => Date.now() - job.timestamp > STALE_JOB_MS,
            );
            return { queue: queue.name, counts, stale };
          }),
        );
        return detail.some((item) => item.stale)
          ? { state: 'degraded' as const, reason: 'STALE_JOBS', detail }
          : { detail };
      }),
      this.check('email', false, async () => {
        const config = this.email.getStatus();
        const latest = this.email.getLatestSend();
        return config.readiness === 'unconfigured' || latest?.success === false
          ? {
              state: 'degraded' as const,
              reason: config.readiness === 'unconfigured' ? 'NOT_CONFIGURED' : 'SEND_FAILED',
              detail: { config, latest },
            }
          : { reason: latest ? 'OK' : 'NO_RESULT', detail: { config, latest } };
      }),
      this.check('auth', true, async () => {
        const issuer = process.env.KEYCLOAK_ISSUER;
        if (!issuer) throw new Error('KEYCLOAK_ISSUER missing');
        const response = await fetch(
          `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
          {
            signal: AbortSignal.timeout(2_500),
            cache: 'no-store',
          },
        );
        if (!response.ok) throw new Error(`Discovery HTTP ${response.status}`);
        const document = (await response.json()) as { issuer?: string };
        if (document.issuer !== issuer.replace(/\/$/, '')) throw new Error('OIDC issuer mismatch');
        return { detail: { issuer: document.issuer } };
      }),
      this.check('web', false, async () => {
        const origin = getAllowedCorsOrigins()[0];
        if (!origin) throw new Error('Web origin missing');
        const response = await fetch(`${origin.replace(/\/$/, '')}/api/version`, {
          signal: AbortSignal.timeout(2_500),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Web HTTP ${response.status}`);
        const version = (await response.json()) as { sha?: string | null };
        if (!version.sha) throw new Error('Web SHA missing');
        return { detail: { origin, sha: version.sha } };
      }),
    ]);
    const apiSha = process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? null;
    const webSha =
      (checks.find((item) => item.name === 'web')?.detail as { sha?: string } | undefined)?.sha ??
      null;
    if (apiSha && webSha && apiSha !== webSha) {
      const web = checks.find((item) => item.name === 'web');
      if (web && web.state === 'operational') {
        web.state = 'degraded';
        web.reason = 'VERSION_MISMATCH';
      }
    }
    const checkedAt = new Date().toISOString();
    const publicStatus: PublicStatus = {
      status: checks.some((item) => item.state === 'outage')
        ? 'outage'
        : checks.some((item) => item.state === 'degraded')
          ? 'degraded'
          : 'operational',
      checkedAt,
      apiSha,
      webSha,
      components: checks.map(({ name, state, latencyMs, checkedAt, reason }) => ({
        name,
        state,
        latencyMs,
        checkedAt,
        reason,
      })),
    };
    const snapshot = { public: publicStatus, details: checks, expires: Date.now() + CACHE_MS };
    this.cached = snapshot;
    return snapshot;
  }
}
