import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { createRedisClient } from '../common/redis';

/** Thrown instead of waiting when an operation needs Redis and Redis is not connected. */
export class RedisUnavailableError extends Error {
  constructor() {
    super('Redis is not connected');
    this.name = 'RedisUnavailableError';
  }
}

/**
 * The one request-path Redis connection (#199), shared by the rate limiter, chat presence and
 * the health check so none of them opens its own. Commands fail at once while Redis is down.
 *
 * `isReady()` is also the question to ask before enqueueing from a request: BullMQ waits for its
 * own connection instead of failing, so a request that enqueues while Redis is down would hang.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis = createRedisClient('request', 'request');

  isReady(): boolean {
    return this.client.status === 'ready';
  }

  assertReady(): void {
    if (!this.isReady()) throw new RedisUnavailableError();
  }

  async ping(): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
