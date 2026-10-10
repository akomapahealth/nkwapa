import { BadRequestException } from '@nestjs/common';

/**
 * Decoded keyset pagination token: the ordering timestamp plus the tie-breaking id.
 *
 * Every paginated read in the API orders by `[<timestamp> desc, id desc]`, so a cursor
 * must carry both halves of that key to resume deterministically.
 */
export interface KeysetCursor {
  timestamp: Date;
  id: string;
}

/**
 * Two wire formats exist in the codebase and both are preserved here so tokens already
 * held by a paginating client keep working across a deploy:
 *
 * - delimited: compact `base64url("<iso>|<id>")`, rejects malformed input with a 400
 * - json:      legacy `base64(JSON)` keyed by a named timestamp field, null when malformed
 */

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function encodeKeysetCursor(timestamp: Date, id: string): string {
  return Buffer.from(`${timestamp.toISOString()}|${id}`).toString('base64url');
}

export function decodeKeysetCursor(cursor: string, invalidMessage: string): KeysetCursor {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf('|');
    const timestamp = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (separator < 1 || !id || !isValidDate(timestamp)) throw new Error('malformed cursor');
    return { timestamp, id };
  } catch {
    throw new BadRequestException({ code: 'INVALID_CURSOR', message: invalidMessage });
  }
}

export function encodeJsonKeysetCursor(field: string, timestamp: Date, id: string): string {
  return Buffer.from(JSON.stringify({ [field]: timestamp.toISOString(), id }), 'utf-8').toString(
    'base64',
  );
}

export function decodeJsonKeysetCursor(field: string, cursor: string): KeysetCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const rawTimestamp = parsed[field];
    const rawId = parsed.id;
    if (typeof rawTimestamp !== 'string' || typeof rawId !== 'string' || !rawId) return null;
    const timestamp = new Date(rawTimestamp);
    if (!isValidDate(timestamp)) return null;
    return { timestamp, id: rawId };
  } catch {
    return null;
  }
}

/**
 * Prisma `where` fragment that resumes a strictly-descending `[field desc, id desc]` scan.
 * Returns an empty object for the first page so it can always be spread into a filter.
 */
export function buildKeysetWhere(
  field: string,
  cursor: KeysetCursor | null,
): Record<string, unknown> {
  if (!cursor) return {};
  return {
    OR: [
      { [field]: { lt: cursor.timestamp } },
      { [field]: cursor.timestamp, id: { lt: cursor.id } },
    ],
  };
}
