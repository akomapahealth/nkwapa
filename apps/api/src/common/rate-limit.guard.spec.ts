import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const mockIncr = jest.fn();
jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    incr: mockIncr,
    expire: jest.fn().mockResolvedValue(1),
  })),
);

import { RateLimitGuard } from './rate-limit.guard';
import { RateLimit } from './rate-limit.decorator';

class Routes {
  @RateLimit({ key: 'sync_push', limit: 2, windowSeconds: 60, scope: 'user' })
  push() {}
}

function contextFor(request: Record<string, unknown>) {
  return {
    getHandler: () => Routes.prototype.push,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
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

  beforeEach(() => mockIncr.mockReset());

  it('records a throttled request by bucket and scope, never by who made it', async () => {
    const telemetry = { record: jest.fn() };
    const guard = new RateLimitGuard(new Reflector(), telemetry as never);
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
    const guard = new RateLimitGuard(new Reflector(), telemetry as never);
    mockIncr.mockResolvedValue(1);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(telemetry.record).not.toHaveBeenCalled();
  });

  it('still throttles when telemetry is not wired in', async () => {
    const guard = new RateLimitGuard(new Reflector());
    mockIncr.mockResolvedValue(3);
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(HttpException);
  });
});
