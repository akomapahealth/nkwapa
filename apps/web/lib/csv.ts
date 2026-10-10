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
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
