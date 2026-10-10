import { BadRequestException } from '@nestjs/common';
import {
  buildKeysetWhere,
  decodeJsonKeysetCursor,
  decodeKeysetCursor,
  encodeJsonKeysetCursor,
  encodeKeysetCursor,
} from './keyset-cursor';

const TIMESTAMP = new Date('2026-08-20T10:30:00.000Z');
const ID = '11111111-1111-4111-8111-111111111111';

describe('keyset cursor', () => {
  describe('delimited format', () => {
    it('round-trips a timestamp and id', () => {
      const decoded = decodeKeysetCursor(encodeKeysetCursor(TIMESTAMP, ID), 'invalid');
      expect(decoded.timestamp.toISOString()).toBe(TIMESTAMP.toISOString());
      expect(decoded.id).toBe(ID);
    });

    it('preserves the existing base64url wire format', () => {
      expect(encodeKeysetCursor(TIMESTAMP, ID)).toBe(
        Buffer.from(`${TIMESTAMP.toISOString()}|${ID}`).toString('base64url'),
      );
    });

    it.each([['not-base64!!'], [''], [Buffer.from('no-separator').toString('base64url')]])(
      'rejects malformed cursor %p with a 400',
      (cursor) => {
        expect(() => decodeKeysetCursor(cursor, 'The history cursor is invalid.')).toThrow(
          BadRequestException,
        );
      },
    );

    it('rejects a cursor carrying an unparseable date', () => {
      const cursor = Buffer.from(`not-a-date|${ID}`).toString('base64url');
      expect(() => decodeKeysetCursor(cursor, 'invalid')).toThrow(BadRequestException);
    });

    it('fails closed when an id contains the separator', () => {
      // Ids are UUIDs, so this cannot happen in practice; assert it rejects rather
      // than silently resuming from a truncated timestamp.
      expect(() => decodeKeysetCursor(encodeKeysetCursor(TIMESTAMP, 'a|b'), 'invalid')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('json format', () => {
    it('round-trips using the named timestamp field', () => {
      const decoded = decodeJsonKeysetCursor(
        'requestedAt',
        encodeJsonKeysetCursor('requestedAt', TIMESTAMP, ID),
      );
      expect(decoded?.timestamp.toISOString()).toBe(TIMESTAMP.toISOString());
      expect(decoded?.id).toBe(ID);
    });

    it('preserves the existing base64 JSON wire format', () => {
      expect(encodeJsonKeysetCursor('createdAt', TIMESTAMP, ID)).toBe(
        Buffer.from(
          JSON.stringify({ createdAt: TIMESTAMP.toISOString(), id: ID }),
          'utf-8',
        ).toString('base64'),
      );
    });

    it('returns null rather than throwing for malformed input', () => {
      expect(decodeJsonKeysetCursor('createdAt', 'not-base64!!')).toBeNull();
      expect(decodeJsonKeysetCursor('createdAt', Buffer.from('{}').toString('base64'))).toBeNull();
    });

    it('returns null when the cursor was encoded for a different field', () => {
      const cursor = encodeJsonKeysetCursor('requestedAt', TIMESTAMP, ID);
      expect(decodeJsonKeysetCursor('createdAt', cursor)).toBeNull();
    });

    it('returns null when the date is unparseable', () => {
      const cursor = Buffer.from(JSON.stringify({ createdAt: 'nope', id: ID })).toString('base64');
      expect(decodeJsonKeysetCursor('createdAt', cursor)).toBeNull();
    });
  });

  describe('buildKeysetWhere', () => {
    it('is empty for the first page so it can always be spread', () => {
      expect(buildKeysetWhere('createdAt', null)).toEqual({});
    });

    it('resumes a strictly descending scan without skipping ties', () => {
      expect(buildKeysetWhere('collectedAt', { timestamp: TIMESTAMP, id: ID })).toEqual({
        OR: [{ collectedAt: { lt: TIMESTAMP } }, { collectedAt: TIMESTAMP, id: { lt: ID } }],
      });
    });
  });
});
