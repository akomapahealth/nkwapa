import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor, requestHash, stableStringify } from './idempotency.interceptor';
import { Idempotent } from './idempotent.decorator';
import type { PrismaService } from '../prisma/prisma.service';

class Marked {
  @Idempotent()
  handle() {}
  plain() {}
}

function contextFor(handler: () => void, headers: Record<string, string>) {
  const request = {
    method: 'POST',
    url: '/clinics/c1/ops/checkins',
    body: { a: 1 },
    params: { clinicId: 'c1' },
    headers,
    user: { user: { id: 'u1' } },
  };
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => Marked,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: 201, setHeader: jest.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  const prisma = {
    idempotencyRecord: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const interceptor = new IdempotencyInterceptor(
    prisma as unknown as PrismaService,
    new Reflector(),
  );
  const next: CallHandler = { handle: () => of({ id: 'row-1' }) };

  beforeEach(() => jest.clearAllMocks());

  it('leaves a request without the header alone', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(contextFor(Marked.prototype.handle, {}), next)),
    ).resolves.toEqual({ id: 'row-1' });
    expect(prisma.idempotencyRecord.createMany).not.toHaveBeenCalled();
  });

  it('leaves an unmarked handler alone even with the header', async () => {
    await lastValueFrom(
      interceptor.intercept(
        contextFor(Marked.prototype.plain, { 'idempotency-key': 'abcdefgh' }),
        next,
      ),
    );
    expect(prisma.idempotencyRecord.createMany).not.toHaveBeenCalled();
  });

  it('refuses a malformed key', () => {
    expect(() =>
      interceptor.intercept(
        contextFor(Marked.prototype.handle, { 'idempotency-key': 'bad key' }),
        next,
      ),
    ).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('claims, runs once and stores the response', async () => {
    prisma.idempotencyRecord.createMany.mockResolvedValue({ count: 1 });
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor(Marked.prototype.handle, { 'idempotency-key': 'abcdefgh' }),
          next,
        ),
      ),
    ).resolves.toEqual({ id: 'row-1' });
    expect(prisma.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'u1', key: 'abcdefgh' } },
      data: { responseStatus: 201, responseBody: { id: 'row-1' } },
    });
  });

  it('replays a committed record without calling the handler', async () => {
    prisma.idempotencyRecord.createMany.mockResolvedValue({ count: 0 });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      clinicId: 'c1',
      method: 'POST',
      path: '/clinics/c1/ops/checkins',
      requestHash: requestHash({ a: 1 }),
      responseStatus: 201,
      responseBody: { id: 'row-1' },
    });
    const handle = jest.fn(() => of({ id: 'row-2' }));
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor(Marked.prototype.handle, { 'idempotency-key': 'abcdefgh' }),
          { handle },
        ),
      ),
    ).resolves.toEqual({ id: 'row-1' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('hashes a body the same whatever its key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
    expect(requestHash({ a: 1, b: 2 })).toBe(requestHash({ b: 2, a: 1 }));
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
  });
});
