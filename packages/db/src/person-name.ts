/**
 * Person names (#342), one set of rules for patients and staff.
 *
 * A name is a required first name, any number of optional middle names in one field, and a
 * required last name. Nothing here splits or guesses: a first name stored as "Nana Kwame" stays
 * that way until someone edits it.
 */

export const PERSON_NAME_MAX_LENGTH = 120;

export interface PersonNameParts {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}

/**
 * `full`: first, middle names, last, for headers, registry detail, documents and anywhere identity
 * matters. `short`: first and last, for table rows, chat, avatars and tight spaces.
 */
export type PersonNameStyle = 'full' | 'short';

const collapse = (value: string | null | undefined) =>
  (value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** Trimmed, inner spaces collapsed; blank is null. */
export function normalizeMiddleName(value: string | null | undefined): string | null {
  return collapse(value) || null;
}

// A bare letter is an initial (every pre-#342 staff middle name is one): "K" reads "K.".
const asWritten = (part: string) => (/^\p{L}$/u.test(part) ? `${part}.` : part);

export function formatPersonName(parts: PersonNameParts, style: PersonNameStyle = 'full'): string {
  const middle =
    style === 'full' ? collapse(parts.middleName).split(' ').filter(Boolean).map(asWritten) : [];
  return [collapse(parts.firstName), ...middle, collapse(parts.lastName)].filter(Boolean).join(' ');
}
