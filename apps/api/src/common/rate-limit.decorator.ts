import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

export const RATE_LIMIT_METADATA_KEY = 'rate-limit-config';

export type RateLimitScope = 'ip' | 'user' | 'user-or-ip';

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowSeconds: number;
  scope?: RateLimitScope;
}

/**
 * A 'user' limit also runs the guard on the route itself. The global copy runs before the
 * controller's JwtAuthGuard, finds no user and lets the request through; a route guard runs after
 * it, so the request is counted against the signed-in user. Use on methods, under a class-level
 * JwtAuthGuard.
 */
export const RateLimit = (config: RateLimitConfig) =>
  config.scope === 'user'
    ? applyDecorators(SetMetadata(RATE_LIMIT_METADATA_KEY, config), UseGuards(RateLimitGuard))
    : SetMetadata(RATE_LIMIT_METADATA_KEY, config);
