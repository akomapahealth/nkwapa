import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

export function getRequestId(request: Request): string | undefined {
  const requestId = request.headers[REQUEST_ID_HEADER];
  if (typeof requestId === 'string' && requestId.trim()) {
    return requestId.trim();
  }

  const correlationId = request.headers[CORRELATION_ID_HEADER];
  if (typeof correlationId === 'string' && correlationId.trim()) {
    return correlationId.trim();
  }

  return undefined;
}

export function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return request.ip ?? null;
}
