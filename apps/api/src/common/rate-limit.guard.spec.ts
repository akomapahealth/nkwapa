import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// These unit cases own their limits. The E2E job's high-volume RATE_LIMIT overrides
// are deliberately irrelevant to the decorator defaults and fallback being asserted here.
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('RATE_LIMIT_')) delete process.env[key];
  }
});
afterEach(() => {
  process.env = originalEnv;
});

const mockIncr = jest.fn();
let redisReady = true;
const redisService = {
  isReady: () => redisReady,
  client: { incr: mockIncr, expire: jest.fn().mockResolvedValue(1) },
};

import { RateLimitGuard } from './rate-limit.guard';
import { RateLimit } from './rate-limit.decorator';

class Routes {
  @RateLimit({ key: 'sync_push', limit: 2, windowSeconds: 60, scope: 'user' })
  push() {}
}

// A fresh request per context: the guard marks a request it has counted.
function contextFor(request: Record<string, unknown>, live = { ...request }) {
  return {
    getHandler: () => Routes.prototype.push,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => live }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard telemetry', () => {
  const request = {
    user: { user: { id: 'user-42' } },
    headers: {},
    method: 'POST',
    originalUrl: '/sync/push?clinicId=abc',
    ip: '10.0.0.7',
    params: { clinicId: 'clinic-1' },
  };

  beforeEach(() => {
    mockIncr.mockReset();
    redisReady = true;
  });

  it('records a throttled request by bucket and scope, never by who made it', async () => {
    const telemetry = { record: jest.fn() };
    const guard = new RateLimitGuard(new Reflector(), redisService as never, telemetry as never);
    mockIncr.mockResolvedValue(3);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(HttpException);

    expect(telemetry.record).toHaveBeenCalledWith('security.rate_limit', {
      bucket: 'sync_push',
      scope: 'user',
      clinicId: 'clinic-1',
    });
    const recorded = JSON.stringify(telemetry.record.mock.calls);
    expect(recorded).not.toContain('user-42');
    expect(recorded).not.toContain('10.0.0.7');
  });

  it('records nothing for a request within its limit', async () => {
    const telemetry = { record: jest.fn() };
    const guard = new RateLimitGuard(new Reflector(), redisService as never, telemetry as never);
    mockIncr.mockResolvedValue(1);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(telemetry.record).not.toHaveBeenCalled();
  });

  it('still throttles when telemetry is not wired in', async () => {
    const guard = new RateLimitGuard(new Reflector(), redisService as never);
    mockIncr.mockResolvedValue(3);
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(HttpException);
  });

  it('lets the request through without touching Redis while Redis is down', async () => {
    redisReady = false;
    const guard = new RateLimitGuard(new Reflector(), redisService as never);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it('fails open when a command fails', async () => {
    mockIncr.mockRejectedValue(new Error('Command timed out'));
    const guard = new RateLimitGuard(new Reflector(), redisService as never);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });
});

describe('RateLimitGuard default limit', () => {
  class Open {
    route() {}
  }
  const contextForOpen = (ip: string) =>
    ({
      getHandler: () => Open.prototype.route,
      getClass: () => Open,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, method: 'GET', originalUrl: '/x', ip }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    process.env.RATE_LIMIT_DEFAULT_LIMIT = '3';
    mockIncr.mockReset();
  });
  afterEach(() => delete process.env.RATE_LIMIT_DEFAULT_LIMIT);

  it('throttles an address past the default ceiling on a route without @RateLimit', async () => {
    const telemetry = { record: jest.fn() };
    const guard = new RateLimitGuard(new Reflector(), redisService as never, telemetry as never);
    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(contextForOpen('203.0.113.9'))).resolves.toBe(true);
    }
    await expect(guard.canActivate(contextForOpen('203.0.113.9'))).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(guard.canActivate(contextForOpen('203.0.113.9'))).rejects.toBeInstanceOf(
      HttpException,
    );
    // Once per window, not per refused request, and never with the address.
    expect(telemetry.record).toHaveBeenCalledTimes(1);
    expect(telemetry.record).toHaveBeenCalledWith('security.rate_limit', {
      bucket: 'default',
      scope: 'ip',
      clinicId: null,
    });
    await expect(guard.canActivate(contextForOpen('203.0.113.10'))).resolves.toBe(true);
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it('starts a fresh window once the old one expires', async () => {
    const guard = new RateLimitGuard(new Reflector(), redisService as never);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    for (let i = 0; i < 3; i++) await guard.canActivate(contextForOpen('203.0.113.9'));
    now.mockReturnValue(1_000 + 61_000);
    await expect(guard.canActivate(contextForOpen('203.0.113.9'))).resolves.toBe(true);
    now.mockRestore();
  });
});

describe('RateLimitGuard user scope', () => {
  beforeEach(() => {
    mockIncr.mockReset();
    redisReady = true;
  });

  it('puts the guard on the route itself, where the signed-in user is known', () => {
    const guards = Reflect.getMetadata('__guards__', Routes.prototype.push) as unknown[];
    expect(guards).toEqual([RateLimitGuard]);
  });

  it('counts a request once: passed over before sign-in, counted after it', async () => {
    const guard = new RateLimitGuard(new Reflector(), redisService as never);
    mockIncr.mockResolvedValue(1);
    const live: Record<string, unknown> = { headers: {}, method: 'POST', ip: '10.0.0.7' };
    const context = contextFor(live, live);

    // The global copy, before JwtAuthGuard: no user yet, so nothing is counted.
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockIncr).not.toHaveBeenCalled();

    // The route copy, after JwtAuthGuard.
    live.user = { user: { id: 'user-42' } };
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockIncr).toHaveBeenCalledWith('rate-limit:sync_push:user-42');

    // Any further pass over the same request is not a second request.
    await guard.canActivate(context);
    expect(mockIncr).toHaveBeenCalledTimes(1);
  });
});
