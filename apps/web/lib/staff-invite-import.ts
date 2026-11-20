import { middleNameError, normalizeStaffNamePart, staffNamePartError } from '@nkwapa/db/staff-name';
import { parseCsv } from './csv';
import type { StaffInviteRole } from './staff-invite';

/**
 * Bulk staff invitations from a spreadsheet export (#383).
 *
 * The file is read in the browser and never uploaded: the rows become ordinary single invites,
 * sent one by one through the same endpoint and checks as the "Invite a colleague" form. So this
 * only has to find the columns, tidy the values and say which rows the API would refuse.
 */

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1024 * 1024;

export interface InviteImportRow {
  /** Stable across edits, for React keys and send results. */
  key: string;
  /** The spreadsheet line, so a person can find the row in their own file. */
  line: number;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  /** Empty until someone picks one: every row needs a role before it can be sent. */
  role: StaffInviteRole | '';
}

export type ParsedInviteCsv = { ok: true; rows: InviteImportRow[] } | { ok: false; error: string };

const ROLE_WORDS: Record<string, StaffInviteRole> = {
  doctor: 'DOCTOR',
  manager: 'MANAGER',
  volunteer: 'VOLUNTEER',
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function columnIndex(headers: string[], test: (header: string) => boolean): number {
  return headers.findIndex(test);
}

/** "BERNARD KWEKU" → "Bernard Kweku". Mixed case is left alone: "McIntyre" stays as typed. */
function tidyName(value: string): string {
  const name = normalizeStaffNamePart(value);
  if (name !== name.toUpperCase() || name === name.toLowerCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());
}

/** First word first, last word last, anything between is the middle name. Editable after. */
export function splitFullName(
  full: string,
): Pick<InviteImportRow, 'firstName' | 'middleName' | 'lastName'> {
  const words = tidyName(full).split(' ').filter(Boolean);
  if (words.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (words.length === 1) return { firstName: words[0], middleName: '', lastName: '' };
  return {
    firstName: words[0],
    middleName: words.slice(1, -1).join(' '),
    lastName: words[words.length - 1],
  };
}

export function parseInviteCsv(text: string): ParsedInviteCsv {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch {
    return { ok: false, error: 'This file is not valid CSV. Export it again as CSV and retry.' };
  }
  table = table.filter((cells) => cells.some((cell) => cell.trim() !== ''));
  if (table.length === 0) return { ok: false, error: 'This file has no rows.' };

  const headers = table[0].map((cell) => cell.trim().toLowerCase());
  let email = columnIndex(headers, (h) => /e-?mail/.test(h));
  let hasHeader = email >= 0;
  if (email < 0) {
    // No email header: take the column where most cells hold an address.
    const width = Math.max(...table.map((cells) => cells.length));
    let best = 0;
    for (let col = 0; col < width; col++) {
      const hits = table.filter((cells) => (cells[col] ?? '').includes('@')).length;
      if (hits > best) {
        best = hits;
        email = col;
      }
    }
    if (email < 0) return { ok: false, error: 'No email column found. Add one headed "Email".' };
    hasHeader = !(table[0][email] ?? '').includes('@');
  }

  const first = hasHeader ? columnIndex(headers, (h) => /^(first|given)/.test(h)) : -1;
  const last = hasHeader ? columnIndex(headers, (h) => /^(last|sur|family)/.test(h)) : -1;
  const full = hasHeader
    ? columnIndex(
        headers,
        (h) => /name/.test(h) && !/^(first|given|last|sur|family|middle|user)/.test(h),
      )
    : -1;
  const middle = hasHeader ? columnIndex(headers, (h) => /^middle/.test(h)) : -1;
  const role = hasHeader ? columnIndex(headers, (h) => /^role/.test(h)) : -1;

  const body = hasHeader ? table.slice(1) : table;
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `This file has ${body.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
    };
  }

  const cell = (cells: string[], col: number) => (col >= 0 ? (cells[col] ?? '') : '');
  const rows = body.map((cells, index): InviteImportRow => {
    const names =
      first >= 0 || last >= 0
        ? {
            firstName: tidyName(cell(cells, first)),
            middleName: tidyName(cell(cells, middle)),
            lastName: tidyName(cell(cells, last)),
          }
        : splitFullName(cell(cells, full));
    return {
      key: `row-${index}`,
      line: index + (hasHeader ? 2 : 1),
      ...names,
      email: cell(cells, email).trim().toLowerCase(),
      role: ROLE_WORDS[cell(cells, role).trim().toLowerCase()] ?? '',
    };
  });
  return { ok: true, rows };
}

export interface InviteImportContext {
  memberEmails: ReadonlySet<string>;
  openInviteEmails: ReadonlySet<string>;
  invitableRoles: readonly StaffInviteRole[];
}

/** Addresses that appear on more than one row. */
export function duplicateEmails(rows: readonly InviteImportRow[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) duplicates.add(email);
    seen.add(email);
  }
  return duplicates;
}

/**
 * Why this row can't be sent as it stands, in a few words, or null when it can. Mirrors the
 * checks the API makes first, so most refusals show up before anything is sent.
 */
export function inviteRowProblem(
  row: InviteImportRow,
  duplicates: ReadonlySet<string>,
  context: InviteImportContext,
): string | null {
  const email = row.email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) return 'Check the email';
  if (duplicates.has(email)) return 'Listed twice';
  if (context.memberEmails.has(email)) return 'Already on the team';
  if (context.openInviteEmails.has(email)) return 'Already invited';

  const firstName = normalizeStaffNamePart(row.firstName);
  const lastName = normalizeStaffNamePart(row.lastName);
  // The API takes first and last name together or not at all.
  if (Boolean(firstName) !== Boolean(lastName))
    return firstName ? 'Add a last name' : 'Add a first name';
  if (firstName && (staffNamePartError(firstName, email) || staffNamePartError(lastName, email))) {
    return 'Check the name';
  }
  if (middleNameError(normalizeStaffNamePart(row.middleName) || null)) return 'Check the name';

  if (!row.role) return 'Choose a role';
  if (!context.invitableRoles.includes(row.role)) return 'Role not allowed';
  return null;
}
