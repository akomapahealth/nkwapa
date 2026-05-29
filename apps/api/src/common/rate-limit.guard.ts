import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { getRateLimitValue } from './api-config';
import { RATE_LIMIT_METADATA_KEY, type RateLimitConfig } from './rate-limit.decorator';
import { getRequestId, getRequestIp } from './request-context';
import { redactLogValue, redactUrl } from './redaction';

type RequestWithUser = {
  user?: { user?: { id?: string } };
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl?: string;
  ip?: string;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  private redisReady = false;

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const identity = this.resolveIdentity(request, config);
    if (!identity) {
      return true;
    }

    try {
      if (!this.redisReady) {
        await this.redis.connect();
        this.redisReady = true;
      }

      const limit = getRateLimitValue(
        `RATE_LIMIT_${config.key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_LIMIT`,
        config.limit,
      );
      const windowSeconds = getRateLimitValue(
        `RATE_LIMIT_${config.key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_WINDOW_SECONDS`,
        config.windowSeconds,
      );

      const bucketKey = `rate-limit:${config.key}:${identity}`;
      const usage = await this.redis.incr(bucketKey);
      if (usage === 1) {
        await this.redis.expire(bucketKey, windowSeconds);
      }

      if (usage > limit) {
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down and try again shortly.',
            recoveryAction: 'Wait a moment and retry the request.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }

      this.logger.warn(
        JSON.stringify({
          message: 'Rate limiter failed open',
          requestId: getRequestId(request as never),
          method: request.method,
          url: redactUrl(request.originalUrl),
          error: redactLogValue(error),
        }),
      );
      this.redisReady = false;
      return true;
    }
  }

  private resolveIdentity(request: RequestWithUser, config: RateLimitConfig) {
    const userId = request.user?.user?.id;
    if (config.scope === 'user') {
      return userId ?? null;
    }

    const ip = getRequestIp(request as never);
    if (config.scope === 'ip') {
      return ip ?? null;
    }

    return userId ?? ip ?? null;
  }
}
