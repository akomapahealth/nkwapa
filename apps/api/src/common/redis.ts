import { Logger } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { redactLogValue } from './redaction';

/*
  Every Redis connection the API opens is made here (#199).

  Redis is optional infrastructure: rate limiting, queues, chat fan-out and presence lean on it,
  but none of them may take HTTP down with them. Before this file each owner built its own client
  with its own defaults, none listened for `error`, and the chat adapter's client used ioredis'
  default of twenty retries per command. When staging's Redis disappeared, that client flushed its
  queue with `MaxRetriesPerRequestError`, nothing caught it, and the process exited twelve seconds
  after boot. A production Redis outage would have done the same.

  So clients come in two kinds, and both keep reconnecting forever on a capped backoff:

  - `request`: used while answering an HTTP request or socket event (rate limiting, presence,
    health). A command fails at once when Redis is not connected rather than waiting for it, so the
    caller can fail open or report degraded.
  - `pubsub`: the chat adapter's pair. Commands wait for a reconnect instead of failing, because a
    subscription that errors out is never retried by the adapter.

  BullMQ builds its own connections from the options below; see `bullQueueConnection` and
  `bullWorkerConnection`.
*/

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Never stop reconnecting, and never wait more than this between attempts. */
export const REDIS_MAX_RECONNECT_DELAY_MS = 10_000;
/** While Redis stays down, one log line per client per this interval. */
export const REDIS_ERROR_LOG_INTERVAL_MS = 60_000;

export type RedisClientRole = 'request' | 'pubsub';

export function redisRetryStrategy(times: number): number {
  return Math.min(times * 500, REDIS_MAX_RECONNECT_DELAY_MS);
}

const ROLE_OPTIONS: Record<RedisClientRole, RedisOptions> = {
  request: {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    commandTimeout: 1_000,
  },
  pubsub: {
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
  },
};

/**
 * Logs a client's connection errors without flooding the log while Redis is down: the first
 * error, then at most one line per interval with how many were left out, and a line when the
 * connection comes back.
 */
export function attachRedisErrorLogging(
  emitter: { on(event: string, listener: (...args: unknown[]) => void): unknown },
  name: string,
  logger: Pick<Logger, 'warn' | 'log'> = new Logger('Redis'),
  now: () => number = Date.now,
) {
  let lastLoggedAt: number | null = null;
  let suppressed = 0;
  let failing = false;

  emitter.on('error', (error: unknown) => {
    failing = true;
    const at = now();
    if (lastLoggedAt !== null && at - lastLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
      suppressed += 1;
      return;
    }
    logger.warn(
      JSON.stringify({
        message: 'Redis connection error',
        client: name,
        error: redactLogValue(error),
        ...(suppressed > 0 ? { suppressed } : {}),
      }),
    );
    lastLoggedAt = at;
    suppressed = 0;
  });

  emitter.on('ready', () => {
    if (!failing) return;
    logger.log(JSON.stringify({ message: 'Redis connection restored', client: name }));
    failing = false;
    lastLoggedAt = null;
    suppressed = 0;
  });
}

export function createRedisClient(
  name: string,
  role: RedisClientRole,
  url: string = REDIS_URL,
): Redis {
  const client = new Redis(url, {
    ...ROLE_OPTIONS[role],
    retryStrategy: redisRetryStrategy,
    connectionName: `nkwapa-api:${name}`,
  });
  attachRedisErrorLogging(client, name);
  return client;
}

/*
  BullMQ connections.

  BullMQ waits for its connection to be ready before running any command, and it forces
  `maxRetriesPerRequest: null` on worker connections, so while Redis is down a queue call does
  not fail: it waits. Two consequences, both handled by callers rather than here:

  - `upsertJobScheduler` in `onModuleInit` must not be awaited, or boot waits for Redis.
  - A request that enqueues must check `RedisStatus.isReady()` first, or the request waits too.

  Queues (producers) never block, so they need no blocking-safe options. Workers do; the worker
  options set the connection explicitly because `@nestjs/bullmq` otherwise reuses the queue's.
*/
const BULL_BASE = {
  url: REDIS_URL,
  retryStrategy: redisRetryStrategy,
  connectTimeout: 5_000,
};

export function bullQueueConnection() {
  return { ...BULL_BASE };
}

export function bullWorkerConnection() {
  return { ...BULL_BASE, maxRetriesPerRequest: null };
}
