/**
 * Staff name rules (#225), shared by the API, the web forms and the seed so a name the form
 * accepts is a name the server accepts, and every `displayName` is built the same way.
 */

export const STAFF_NAME_MAX_LENGTH = 120;

export type StaffNameError = 'REQUIRED' | 'TOO_LONG' | 'INVALID_CHARACTERS' | 'EQUALS_EMAIL';

export interface StaffNameParts {
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
}

// Letters in any script (with combining marks), plus space, hyphen, apostrophes and period.
const NAME_PART = /^\p{L}[\p{L}\p{M} '’.-]*$/u;
const SINGLE_LETTER = /^\p{L}$/u;

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

/** "k." -> "K"; blank -> null. Invalid input is returned as-is for `middleInitialError` to reject. */
export function normalizeMiddleInitial(value: string | null | undefined): string | null {
  const stripped = (value ?? '').normalize('NFC').replace(/[\s.]+/g, '');
  return stripped ? stripped.toLocaleUpperCase() : null;
}

/** Validate an already-normalized middle initial (null is fine: it is optional). */
export function middleInitialError(value: string | null): 'INVALID_CHARACTERS' | null {
  return value === null || SINGLE_LETTER.test(value) ? null : 'INVALID_CHARACTERS';
}

/** "Ama K. Mensah", or "Ama Mensah" without an initial. */
export function formatStaffDisplayName({ firstName, middleInitial, lastName }: StaffNameParts) {
  return [firstName, middleInitial ? `${middleInitial}.` : null, lastName]
    .filter(Boolean)
    .join(' ');
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

export const MIDDLE_INITIAL_MESSAGE = 'Middle initial must be a single letter.';
