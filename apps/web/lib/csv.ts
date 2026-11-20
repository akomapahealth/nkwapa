import { saveBlob } from './download';

/**
 * Spreadsheet export, built in the browser from data the screen already holds.
 *
 * A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is read by Excel and
 * Sheets as a formula, which is how a clinic name typed as `=HYPERLINK(...)` becomes something
 * that runs when the file is opened. Such cells are prefixed with an apostrophe, which the
 * spreadsheet treats as "this is text" and does not display. Numbers are left alone: a negative
 * count is still a number, not an injected formula.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text, CRLF-terminated as RFC 4180 describes. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

/** Hand the browser a CSV file to save. A byte-order mark keeps Excel from mangling non-ASCII. */
export function downloadCsv(filename: string, rows: readonly (readonly CsvCell[])[]): void {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  void saveBlob(blob, filename);
}

/**
 * RFC 4180 CSV, as Google Sheets and Excel write it: quoted fields may hold commas, newlines and
 * doubled quotes. Mirrors apps/api/src/screening-import/csv.ts, which the web cannot import.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
