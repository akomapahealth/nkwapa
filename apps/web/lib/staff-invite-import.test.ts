import { parseCsv } from './csv';
import {
  duplicateEmails,
  inviteRowProblem,
  MAX_IMPORT_ROWS,
  parseInviteCsv,
  splitFullName,
  type InviteImportRow,
} from './staff-invite-import';

// Synthetic, shaped like a Google Forms volunteer export: trailing spaces in headers and values,
// a consent column to ignore, phone numbers, one malformed address.
const FORM_EXPORT = [
  'Timestamp,Full Name ,Email Address,Phone Number (WhatsApp Preferred) ,"Would you like updates, by email?"',
  '11/15/2026 9:28:14,Kofi Test Mensah ,Kofi.Mensah@example.test ,0240000001,Yes',
  '11/15/2026 9:33:09,AMA SERWAA TEST,ama.test@example.test,0240000002,No',
  '11/15/2026 9:35:43, Yaw Tester,yaw.example.test,0240000003,Maybe',
  '11/15/2026 9:41:58,Esi,esi@example.test,0240000004,Yes',
].join('\n');

const context = {
  memberEmails: new Set(['member@example.test']),
  openInviteEmails: new Set(['invited@example.test']),
  invitableRoles: ['MANAGER', 'DOCTOR', 'VOLUNTEER'],
};

function rowsOf(text: string): InviteImportRow[] {
  const parsed = parseInviteCsv(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.rows;
}

describe('parseCsv', () => {
  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nd,e,f,g')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['d', 'e', 'f', 'g'],
    ]);
  });

  it('drops a byte-order mark and refuses an unterminated quote', () => {
    expect(parseCsv('﻿x,y')).toEqual([['x', 'y']]);
    expect(() => parseCsv('"open')).toThrow();
  });
});

describe('parseInviteCsv', () => {
  it('finds name and email in a form export and ignores everything else', () => {
    const rows = rowsOf(FORM_EXPORT);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      line: 2,
      firstName: 'Kofi',
      middleName: 'Test',
      lastName: 'Mensah',
      email: 'kofi.mensah@example.test',
      role: '',
    });
    // Shouting capitals become a name; mixed case is left as typed.
    expect(rows[1]).toMatchObject({ firstName: 'Ama', middleName: 'Serwaa', lastName: 'Test' });
  });

  it('reads separate first and last name columns and a role column', () => {
    const rows = rowsOf('First name,Last name,Email,Role\nAma,Owusu,ama@example.test,Doctor');
    expect(rows[0]).toMatchObject({ firstName: 'Ama', lastName: 'Owusu', role: 'DOCTOR' });
  });

  it('falls back to the column of addresses when nothing is headed email', () => {
    const rows = rowsOf('Kofi Mensah,kofi@example.test\nAma Owusu,ama@example.test');
    expect(rows.map((row) => row.email)).toEqual(['kofi@example.test', 'ama@example.test']);
    expect(rows[0]).toMatchObject({ line: 1, firstName: '', lastName: '' });
  });

  it('explains files it cannot use', () => {
    expect(parseInviteCsv('')).toEqual({ ok: false, error: 'This file has no rows.' });
    expect(parseInviteCsv('Name,Phone\nKofi,024')).toMatchObject({ ok: false });
    const tooMany = [
      'Email',
      ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `p${i}@x.test`),
    ];
    expect(parseInviteCsv(tooMany.join('\n'))).toMatchObject({ ok: false });
  });
});

describe('splitFullName', () => {
  it('puts every inner word in the middle name', () => {
    expect(splitFullName('  Ama  Kukua Adwoa Mensah ')).toEqual({
      firstName: 'Ama',
      middleName: 'Kukua Adwoa',
      lastName: 'Mensah',
    });
    expect(splitFullName('Esi')).toEqual({ firstName: 'Esi', middleName: '', lastName: '' });
  });
});

describe('inviteRowProblem', () => {
  const ready = (overrides: Partial<InviteImportRow> = {}): InviteImportRow => ({
    key: 'k',
    line: 2,
    firstName: 'Kofi',
    middleName: '',
    lastName: 'Mensah',
    email: 'kofi@example.test',
    role: 'VOLUNTEER',
    ...overrides,
  });
  const problem = (row: InviteImportRow, rows = [row]) =>
    inviteRowProblem(row, duplicateEmails(rows), context);

  it('passes a complete row', () => {
    expect(problem(ready())).toBeNull();
    // A row with no name at all is fine: the invitee adds it on first sign-in.
    expect(problem(ready({ firstName: '', lastName: '' }))).toBeNull();
  });

  it.each([
    [{ email: 'yaw.example.test' }, 'Check the email'],
    [{ email: 'member@example.test' }, 'Already on the team'],
    [{ email: 'invited@example.test' }, 'Already invited'],
    [{ lastName: '' }, 'Add a last name'],
    [{ firstName: 'K0fi' }, 'Check the name'],
    [{ role: '' as const }, 'Choose a role'],
    [{ role: 'DIRECTOR' }, 'Role not allowed'],
  ])('flags %o as "%s"', (overrides, message) => {
    expect(problem(ready(overrides))).toBe(message);
  });

  it('flags an address listed twice, whatever its case', () => {
    const rows = [ready({ key: 'a' }), ready({ key: 'b', email: 'KOFI@example.test' })];
    expect(problem(rows[0], rows)).toBe('Listed twice');
  });
});
