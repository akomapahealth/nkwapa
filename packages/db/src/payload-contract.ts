/**
 * The JSONB payload contract, and why it is hand-written.
 *
 * `docs/design-system/MASTER.md` section 10 rules out adding a validation library to this product,
 * and the rule is not arbitrary: a schema library's error objects are shaped for a compiler, and
 * the two consumers here need the same parse rendered two different ways. The request DTO turns a
 * failure into a `BadRequestException`; the encounter form turns the same failure into per-field
 * `FieldError` messages next to the controls that caused it.
 *
 * So parsing **returns** its problems rather than throwing them. One call, one list of issues,
 * two presentations, and no possibility of the API and the form disagreeing about what a valid
 * lifestyle payload is.
 *
 * `parseLegacyDiabetesSymptoms` in `diabetes-screening.ts` already established the return-what-you-
 * found shape; this generalizes it.
 */

export type PayloadIssueCode =
  /** A key the contract does not declare. Rejected rather than ignored -- see below. */
  | 'UNKNOWN_KEY'
  /** A declared key whose value is outside its vocabulary. */
  | 'UNKNOWN_VALUE'
  /** A declared key of the wrong JSON type. */
  | 'WRONG_TYPE'
  /** A free-text field beyond its length limit. */
  | 'TOO_LONG'
  /** The payload declares a schema version this build does not understand. */
  | 'SCHEMA_VERSION';

export interface PayloadIssue {
  /** Dotted path from the payload root, usable directly as a form field key. */
  readonly path: string;
  readonly code: PayloadIssueCode;
  /** One sentence, written for whoever has to fix the data. */
  readonly message: string;
}

export interface ParsedPayload<T> {
  readonly schemaVersion: number;
  readonly payload: T;
  readonly issues: readonly PayloadIssue[];
}

/**
 * Accumulates issues while a parser walks a payload.
 *
 * Deliberately mutable and deliberately not thrown from: a parser reports everything wrong with a
 * payload in one pass, because a form that surfaces one error at a time makes a volunteer submit
 * a sixty-field interview once per mistake.
 */
export class PayloadIssues {
  private readonly collected: PayloadIssue[] = [];

  add(path: string, code: PayloadIssueCode, message: string): void {
    this.collected.push({ path, code, message });
  }

  get list(): readonly PayloadIssue[] {
    return this.collected;
  }

  get ok(): boolean {
    return this.collected.length === 0;
  }
}

/** Narrow an unknown to a plain JSON object, reporting anything else. */
export function readObject(
  value: unknown,
  path: string,
  issues: PayloadIssues,
): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    issues.add(path || 'payload', 'WRONG_TYPE', 'Expected an object.');
    return {};
  }
  return value as Record<string, unknown>;
}

/**
 * Reject keys the contract does not declare, rather than dropping them silently.
 *
 * A silently dropped key is how a client that believes it is recording something, and a server
 * that never stores it, coexist for months. Rejecting turns that into a failure at the first
 * request.
 */
export function rejectUnknownKeys(
  source: Record<string, unknown>,
  known: readonly string[],
  prefix: string,
  issues: PayloadIssues,
): void {
  const declared = new Set<string>(known);
  for (const key of Object.keys(source)) {
    if (!declared.has(key)) {
      issues.add(joinPath(prefix, key), 'UNKNOWN_KEY', `"${key}" is not part of this section.`);
    }
  }
}

/** Read a member of a closed vocabulary, falling back when absent or invalid. */
export function readEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
  prefix: string,
  issues: PayloadIssues,
): T {
  const raw = source[key];
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== 'string') {
    issues.add(joinPath(prefix, key), 'WRONG_TYPE', 'Expected one of the listed options.');
    return fallback;
  }
  if (!(allowed as readonly string[]).includes(raw)) {
    issues.add(joinPath(prefix, key), 'UNKNOWN_VALUE', `"${raw}" is not one of the options.`);
    return fallback;
  }
  return raw as T;
}

/** Read a set of vocabulary members, de-duplicated and order-preserving. */
export function readEnumArray<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  prefix: string,
  issues: PayloadIssues,
): T[] {
  const raw = source[key];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    issues.add(joinPath(prefix, key), 'WRONG_TYPE', 'Expected a list of options.');
    return [];
  }

  const seen = new Set<string>();
  const out: T[] = [];
  raw.forEach((entry, index) => {
    const at = `${joinPath(prefix, key)}[${index}]`;
    if (typeof entry !== 'string') {
      issues.add(at, 'WRONG_TYPE', 'Expected one of the listed options.');
      return;
    }
    if (!(allowed as readonly string[]).includes(entry)) {
      issues.add(at, 'UNKNOWN_VALUE', `"${entry}" is not one of the options.`);
      return;
    }
    if (seen.has(entry)) return;
    seen.add(entry);
    out.push(entry as T);
  });
  return out;
}

export function readBoolean(
  source: Record<string, unknown>,
  key: string,
  prefix: string,
  issues: PayloadIssues,
): boolean | null {
  const raw = source[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'boolean') {
    issues.add(joinPath(prefix, key), 'WRONG_TYPE', 'Expected true or false.');
    return null;
  }
  return raw;
}

/** Read a bounded integer. Non-finite and fractional values are rejected, not rounded. */
export function readInteger(
  source: Record<string, unknown>,
  key: string,
  bounds: { min: number; max: number },
  prefix: string,
  issues: PayloadIssues,
): number | null {
  const raw = source[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    issues.add(joinPath(prefix, key), 'WRONG_TYPE', 'Expected a whole number.');
    return null;
  }
  if (raw < bounds.min || raw > bounds.max) {
    issues.add(
      joinPath(prefix, key),
      'UNKNOWN_VALUE',
      `Expected a number between ${bounds.min} and ${bounds.max}.`,
    );
    return null;
  }
  return raw;
}

/**
 * Read a free-text field.
 *
 * Trims, treats an empty result as absent, and reports rather than truncates when it is too long.
 * Truncating loses whatever the volunteer thought was worth writing down, usually the end of the
 * sentence that carried the meaning.
 */
export function readText(
  source: Record<string, unknown>,
  key: string,
  maxLength: number,
  prefix: string,
  issues: PayloadIssues,
): string | null {
  const raw = source[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    issues.add(joinPath(prefix, key), 'WRONG_TYPE', 'Expected text.');
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    issues.add(
      joinPath(prefix, key),
      'TOO_LONG',
      `Please keep this under ${maxLength} characters.`,
    );
    return null;
  }
  return trimmed;
}

/**
 * Read the payload's declared schema version.
 *
 * A version this build does not recognise is an issue, not an exception, so a newer client talking
 * to an older server degrades to "this section could not be read" instead of failing the whole
 * interview save. The record's other sections are still worth keeping.
 */
export function readSchemaVersion(
  source: Record<string, unknown>,
  current: number,
  issues: PayloadIssues,
): number {
  const raw = source.schemaVersion;
  if (raw === undefined || raw === null) return current;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    issues.add('schemaVersion', 'WRONG_TYPE', 'Expected a positive whole number.');
    return current;
  }
  if (raw > current) {
    issues.add(
      'schemaVersion',
      'SCHEMA_VERSION',
      `This record was written by a newer version of Nkwapa (version ${raw}).`,
    );
  }
  return raw;
}

function joinPath(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}
