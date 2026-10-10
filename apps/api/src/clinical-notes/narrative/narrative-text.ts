/**
 * Shared sentence-building helpers for the generated clinical notes.
 *
 * Everything here is deterministic and locale-free. A note is rendered on a server whose locale
 * nobody controls, stored, and later compared against a signed hash; a number or date that renders
 * differently on two machines would make the same record look edited.
 */

/** What a missing value reads as. One phrase, so a note never has a blank where a fact belongs. */
export const NOT_RECORDED = 'Not recorded';

/**
 * Readers that narrow one field of a stored row.
 *
 * The generators take the row as `Record<string, unknown>` rather than a typed model, because they
 * render whatever the database holds -- including a row a newer release wrote. Narrowing at each
 * read means a field of an unexpected shape renders as absent instead of as `[object Object]`, and
 * keeps `any` out of a module whose output ends up in a clinical record.
 */
export function num(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}

export function str(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim() : null;
}

export function arr(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function bool(input: unknown): boolean {
  return input === true;
}

/** The `selected` list inside a volunteer-actions payload. */
export function selected(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  return arr((input as { selected?: unknown }).selected);
}

/** Render a value, or say plainly that nobody recorded one. */
export function value(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return NOT_RECORDED;
  const rendered = typeof text === 'number' ? String(text) : text.trim();
  return rendered || NOT_RECORDED;
}

/**
 * A date, as an ISO calendar day.
 *
 * Deliberately not `toLocaleDateString`: the format would depend on the server's locale, and a
 * clinical record that reads differently depending on which machine rendered it is not a record.
 */
export function isoDay(date: unknown): string {
  if (!date) return NOT_RECORDED;
  if (!(date instanceof Date) && typeof date !== 'string') return NOT_RECORDED;
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (!Number.isFinite(parsed.getTime())) return NOT_RECORDED;
  return parsed.toISOString().slice(0, 10);
}

/** Join a list the way a person writes one: "a, b and c". */
export function list(items: readonly string[], empty = NOT_RECORDED): string {
  const present = items.filter((item) => item && item.trim());
  if (!present.length) return empty;
  if (present.length === 1) return present[0];
  return `${present.slice(0, -1).join(', ')} and ${present.at(-1)}`;
}

/**
 * One coded value's label, or the absent-value phrase.
 *
 * A code this build cannot name renders as "Not recorded" rather than as `undefined`. Notes are
 * generated from rows that a newer release may have written, and a note is the wrong place to
 * discover a version skew.
 */
export function label(
  labels: Record<string, string>,
  code: unknown,
  fallback: string = NOT_RECORDED,
): string {
  return (typeof code === 'string' && labels[code]) || fallback;
}

/** Lower-cased, for a label used mid-sentence. */
export function lower(
  labels: Record<string, string>,
  code: unknown,
  fallback: string = NOT_RECORDED,
): string {
  return label(labels, code, fallback).toLowerCase();
}

/** Map coded values to their labels, dropping anything this build cannot name. */
export function labelled(
  codes: readonly string[] | null | undefined,
  labels: Record<string, string>,
): string[] {
  return (codes ?? []).map((code) => labels[code]).filter((label): label is string => !!label);
}

/** A blood pressure, or the absent-value phrase. Half a reading is not a reading. */
export function bloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): string {
  if (systolic == null || diastolic == null) return NOT_RECORDED;
  return `${systolic}/${diastolic} mmHg`;
}

/**
 * Assemble a section from its paragraphs.
 *
 * Empty paragraphs are dropped rather than rendered as blank lines, and the order is fixed by the
 * caller, because a note whose paragraphs move between renders cannot be diffed by a reviewer.
 */
export function section(paragraphs: readonly (string | null)[]): string {
  return paragraphs
    .filter((paragraph): paragraph is string => !!paragraph && paragraph.trim().length > 0)
    .map((paragraph) => paragraph.trim())
    .join('\n\n');
}

/** One labelled paragraph, e.g. "Blood pressure:\nInitial reading was …". */
export function paragraph(heading: string, body: string): string {
  return `${heading}:\n${body}`;
}
