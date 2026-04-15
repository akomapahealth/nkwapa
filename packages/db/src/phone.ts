/**
 * Phone number normalization to E.164.
 * Uses libphonenumber-js with default region GH (Ghana).
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneToE164(raw: string, defaultRegion: 'GH' = 'GH'): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultRegion);
  return parsed?.isValid() ? parsed.format('E.164') : null;
}
