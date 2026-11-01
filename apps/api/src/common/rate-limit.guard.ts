import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRateLimitValue } from './api-config';
import { RATE_LIMIT_METADATA_KEY, type RateLimitConfig } from './rate-limit.decorator';
import { getRequestId, getRequestIp } from './request-context';
import { redactLogValue, redactUrl } from './redaction';
import { TelemetryService } from '../telemetry/telemetry.service';
import { RedisService } from '../redis/redis.service';

type RequestWithUser = {
  user?: { user?: { id?: string } };
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl?: string;
  ip?: string;
  params?: Record<string, string | undefined>;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  // shortcut: counts per API instance, so N instances allow N times the limit; move to Redis if we scale out.
  private readonly defaultBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!config) {
      return this.checkDefaultLimit(request);
    }

    const identity = this.resolveIdentity(request, config);
    if (!identity) {
      return true;
    }

    // Fails open while Redis is down (#199), and quietly: the client already logs the outage, so a
    // line per request would only bury it.
    if (!this.redisService.isReady()) {
      return true;
    }

    try {
      const redis = this.redisService.client;

      const limit = getRateLimitValue(
        `RATE_LIMIT_${config.key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_LIMIT`,
        config.limit,
      );
      const windowSeconds = getRateLimitValue(
        `RATE_LIMIT_${config.key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_WINDOW_SECONDS`,
        config.windowSeconds,
      );

      const bucketKey = `rate-limit:${config.key}:${identity}`;
      const usage = await redis.incr(bucketKey);
      if (usage === 1) {
        await redis.expire(bucketKey, windowSeconds);
      }

      if (usage > limit) {
        // The bucket and its scope only. The identity the bucket is keyed on is a user id or an
        // address, and neither belongs in telemetry.
        this.telemetry?.record('security.rate_limit', {
          bucket: config.key,
          scope: config.scope ?? 'user-or-ip',
          clinicId: request.params?.clinicId ?? null,
        });
        throw rateLimited();
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
      return true;
    }
  }

  /**
   * A per-address ceiling for every route without its own @RateLimit, so none is unbounded. It is
   * kept in memory to add no Redis commands per request, and set high because a whole clinic can
   * share one public address.
   */
  private checkDefaultLimit(request: RequestWithUser) {
    const ip = getRequestIp(request as never);
    if (!ip) return true;

    const limit = getRateLimitValue('RATE_LIMIT_DEFAULT_LIMIT', 600);
    const windowMs = getRateLimitValue('RATE_LIMIT_DEFAULT_WINDOW_SECONDS', 60) * 1000;
    const now = Date.now();

    // Bounds memory when many addresses pass through, as a crawler farm would.
    if (this.defaultBuckets.size > 10_000) {
      for (const [key, bucket] of this.defaultBuckets) {
        if (bucket.resetAt <= now) this.defaultBuckets.delete(key);
      }
    }

    let bucket = this.defaultBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.defaultBuckets.set(ip, bucket);
    }
    bucket.count += 1;

    if (bucket.count > limit) {
      if (bucket.count === limit + 1) {
        this.telemetry?.record('security.rate_limit', {
          bucket: 'default',
          scope: 'ip',
          clinicId: request.params?.clinicId ?? null,
        });
      }
      throw rateLimited();
    }
    return true;
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

function rateLimited() {
  return new HttpException(
    {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down and try again shortly.',
      recoveryAction: 'Wait a moment and retry the request.',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
