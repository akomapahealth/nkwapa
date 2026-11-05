import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { defer, from, mergeMap, of, type Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { IDEMPOTENT_KEY } from './idempotent.decorator';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
/** Marks a claimed key whose write has not committed. Never visible outside its transaction. */
const PENDING_STATUS = 0;

type IdempotentRequest = {
  method: string;
  originalUrl?: string;
  url: string;
  body?: unknown;
  clinicId?: string;
  params?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  user?: { user?: { id?: string } };
};

type IdempotentResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
};

/** JSON with object keys sorted, so the same body always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function requestHash(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

/**
 * Idempotency keys for online writes (#307).
 *
 * Registered after PrismaRlsInterceptor, so it runs inside the request's own transaction: the
 * key is claimed, the write runs, and the stored response is saved in one commit. A write that
 * fails rolls its claim back with it, so the same key can be retried. A second request with the
 * same key while the first is still running waits on the unique index, then sees the committed
 * row and replays it. Guards run before interceptors, so a replay is still authorized afresh,
 * and the table's row level security returns a record only to the user and clinic that made it.
 *
 * Opt-in per handler with @Idempotent(). Requests without the header are untouched.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return next.handle();

    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    const response = context.switchToHttp().getResponse<IdempotentResponse>();
    const raw = request.headers[IDEMPOTENCY_HEADER];
    const key = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!key) return next.handle();
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'The Idempotency-Key header must be 8 to 128 letters, digits, - or _.',
      });
    }

    const userId = request.user?.user?.id;
    const clinicId = request.clinicId ?? request.params?.clinicId;
    // Every idempotent route is clinic scoped and signed in; without both there is nothing to key on.
    if (!userId || !clinicId) return next.handle();

    const fingerprint = {
      method: request.method.toUpperCase(),
      path: (request.originalUrl ?? request.url).split('?')[0].slice(0, 512),
      requestHash: requestHash(request.body),
    };

    return defer(() => from(this.claim(clinicId, userId, key, fingerprint))).pipe(
      mergeMap((replay) => {
        if (replay) {
          response.setHeader('Idempotent-Replayed', 'true');
          return of(replay.body);
        }
        return next
          .handle()
          .pipe(
            mergeMap((body: unknown) =>
              from(this.store(userId, key, response.statusCode, body)).pipe(
                mergeMap(() => of(body)),
              ),
            ),
          );
      }),
    );
  }

  private async claim(
    clinicId: string,
    userId: string,
    key: string,
    fingerprint: { method: string; path: string; requestHash: string },
  ): Promise<{ body: unknown } | null> {
    const now = new Date();
    await this.prisma.idempotencyRecord.deleteMany({
      where: { userId, key, expiresAt: { lte: now } },
    });
    // ON CONFLICT DO NOTHING: a concurrent holder of the key makes this wait for its commit
    // instead of aborting the transaction.
    const claimed = await this.prisma.idempotencyRecord.createMany({
      data: [
        {
          clinicId,
          userId,
          key,
          ...fingerprint,
          responseStatus: PENDING_STATUS,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      ],
      skipDuplicates: true,
    });
    if (claimed.count === 1) return null;

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!existing || existing.responseStatus === PENDING_STATUS) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'This request is still being processed.',
        retryable: true,
        recoveryAction: 'Wait a moment and try again.',
      });
    }
    if (
      existing.clinicId !== clinicId ||
      existing.method !== fingerprint.method ||
      existing.path !== fingerprint.path ||
      existing.requestHash !== fingerprint.requestHash
    ) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This request key was already used for a different request.',
        retryable: false,
        recoveryAction: 'Refresh the page and try again.',
      });
    }
    return { body: existing.responseBody };
  }

  private async store(userId: string, key: string, status: number, body: unknown) {
    const stored =
      body === undefined
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue);
    await this.prisma.idempotencyRecord.update({
      where: { userId_key: { userId, key } },
      data: { responseStatus: status || 200, responseBody: stored },
    });
  }
}
