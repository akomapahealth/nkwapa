/**
 * Staff name rules (#225), shared by the API, the web forms and the seed so a name the form
 * accepts is a name the server accepts, and every `displayName` is built the same way.
 */

import { formatPersonName, PERSON_NAME_MAX_LENGTH } from './person-name';

export { normalizeMiddleName } from './person-name';

export const STAFF_NAME_MAX_LENGTH = PERSON_NAME_MAX_LENGTH;

export type StaffNameError = 'REQUIRED' | 'TOO_LONG' | 'INVALID_CHARACTERS' | 'EQUALS_EMAIL';

export interface StaffNameParts {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

// Letters in any script (with combining marks), plus space, hyphen, apostrophes and period.
const NAME_PART = /^\p{L}[\p{L}\p{M} '’.-]*$/u;

/** NFC, trimmed, inner whitespace collapsed. */
export function normalizeStaffNamePart(value: string | null | undefined): string {
  return (value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Validate an already-normalized first or last name. */
export function staffNamePartError(value: string, email?: string | null): StaffNameError | null {
  if (!value) return 'REQUIRED';
  if (value.length > STAFF_NAME_MAX_LENGTH) return 'TOO_LONG';
  if (!NAME_PART.test(value)) return 'INVALID_CHARACTERS';
  if (email && value.toLowerCase() === email.trim().toLowerCase()) return 'EQUALS_EMAIL';
  return null;
}

/**
 * Validate an already-normalized middle name (null is fine: it is optional). The first and last
 * name's character rules, so spaces, hyphens and apostrophes are allowed.
 */
export function middleNameError(value: string | null): 'TOO_LONG' | 'INVALID_CHARACTERS' | null {
  if (value === null) return null;
  const error = staffNamePartError(value);
  return error === 'TOO_LONG' || error === 'INVALID_CHARACTERS' ? error : null;
}

/** "Ama Kukua Mensah", "Ama K. Mensah" for a stored initial, or "Ama Mensah". */
export function formatStaffDisplayName(parts: StaffNameParts) {
  return formatPersonName(parts, 'full');
}

export function staffNameMessage(error: StaffNameError, label: string): string {
  switch (error) {
    case 'REQUIRED':
      return `Enter your ${label.toLowerCase()}.`;
    case 'TOO_LONG':
      return `${label} must be ${STAFF_NAME_MAX_LENGTH} characters or fewer.`;
    case 'INVALID_CHARACTERS':
      return `${label} can only use letters, spaces, hyphens, apostrophes and periods.`;
    case 'EQUALS_EMAIL':
      return `${label} can't be your email address.`;
  }
}
