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

/**
 * The client's address, for rate limits and the audit log.
 *
 * X-Forwarded-For is written by the client before any proxy appends to it, so its first entry can
 * be anything the caller likes. In production, CLIENT_IP_HEADER names the header the edge sets
 * itself and overwrites on every request (`true-client-ip` behind Render's Cloudflare), and
 * X-Forwarded-For is then never read. Without it, as in local development, the old behaviour stays.
 */
export function getRequestIp(request: Request): string | null {
  const trustedHeader = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trustedHeader) {
    return firstAddress(request.headers[trustedHeader]) ?? request.ip ?? null;
  }

  return firstAddress(request.headers['x-forwarded-for']) ?? request.ip ?? null;
}

function firstAddress(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || null;
}
