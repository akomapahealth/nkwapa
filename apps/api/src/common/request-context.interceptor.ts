import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { getRequestId, getRequestIp } from './request-context';
import { runWithRequestContext } from './request-context.store';

/**
 * Publish the request's identity for the duration of the handler.
 *
 * Registered ahead of the RLS interceptor so anything establishing a tenant context can already
 * report which request asked for it.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const userAgent = request.headers['user-agent'];

    return runWithRequestContext(
      {
        requestId: getRequestId(request) ?? randomUUID(),
        ipAddress: getRequestIp(request),
        userAgent: typeof userAgent === 'string' ? userAgent : null,
      },
      () => next.handle(),
    );
  }
}
