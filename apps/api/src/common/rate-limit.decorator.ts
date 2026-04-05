import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'rate-limit-config';

export type RateLimitScope = 'ip' | 'user' | 'user-or-ip';

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowSeconds: number;
  scope?: RateLimitScope;
}

export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_METADATA_KEY, config);
