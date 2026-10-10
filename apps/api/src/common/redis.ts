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

/*
  Worker options that keep an idle API's command count down (#199).

  An idle worker still talks to Redis: it long-polls for work (one BZPOPMIN per `drainDelay`
  seconds, or every 10 s at most while the queue holds a delayed job, which every scheduler queue
  always does) and runs a stalled-job check every `stalledInterval`. With seven workers at
  BullMQ's defaults that is well over a hundred thousand commands a day doing nothing, which is
  what used up staging's Upstash free tier. A job added to an empty queue still wakes its worker at
  once; `drainDelay` only stretches the wait when there is nothing to do. A job whose worker died
  is now recovered within five minutes instead of thirty seconds, which none of these queues
  notices.
*/
export const IDLE_WORKER_DRAIN_DELAY_SECONDS = 30;
export const IDLE_WORKER_STALLED_INTERVAL_MS = 5 * 60 * 1000;

export function workerOptions<T extends object>(options?: T) {
  return {
    connection: bullWorkerConnection(),
    drainDelay: IDLE_WORKER_DRAIN_DELAY_SECONDS,
    stalledInterval: IDLE_WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: 1,
    ...options,
  };
}

/*
  Errors ioredis and BullMQ reject with when Redis is unreachable. Most are plain `Error`s, so
  they are told apart by name and message.
*/
const REDIS_ERROR_NAMES = new Set(['MaxRetriesPerRequestError', 'ConnectionClosedError']);
const REDIS_ERROR_MESSAGES = [
  /^Connection is closed\.?$/,
  /^Stream isn't writeable and enableOfflineQueue options is false$/,
  /^Command timed out$/,
  /^Reached the max retries per request limit/,
];

export function isRedisConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    REDIS_ERROR_NAMES.has(error.name) ||
    REDIS_ERROR_MESSAGES.some((pattern) => pattern.test(error.message))
  );
}

/**
 * The last line of defence (#199): a Redis rejection that nothing awaited is logged and reported
 * instead of ending the process. Every client is meant to handle its own failures, so reaching
 * this is a bug to fix, but not one worth an outage. Any other unhandled rejection is rethrown,
 * which ends the process exactly as Node would have.
 */
export function installRedisRejectionGuard(
  report: (error: unknown) => void,
  logger: Pick<Logger, 'error'> = new Logger('Redis'),
) {
  process.on('unhandledRejection', (reason) => {
    if (!isRedisConnectionError(reason)) throw reason;
    logger.error(
      JSON.stringify({
        message: 'Unhandled Redis rejection; the API stays up',
        error: redactLogValue(reason),
      }),
    );
    report(reason);
  });
}
