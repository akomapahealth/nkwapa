const MAX_LOG_MESSAGE_LENGTH = 240;

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/\bBasic\s+[A-Za-z0-9+/=-]+/gi, 'Basic [redacted]'],
  [/\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi, 'postgres://[redacted]'],
  [/\bredis:\/\/(?::[^@\s]+@)?[^\s]+/gi, 'redis://[redacted]'],
  [/\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[redacted-token]'],
  [/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '[redacted-jwt]'],
  [/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]'],
  [/\+?[0-9][0-9 .()/-]{7,}[0-9]/g, '[redacted-phone]'],
];

export function redactUrl(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, 'http://local');
    return `${parsed.pathname}${parsed.search ? '?[redacted]' : ''}`;
  } catch {
    return url.split('?')[0] || '[invalid-url]';
  }
}

/**
 * Reduce a value to one loggable line without losing it entirely.
 *
 * Taking `split('\n')[0]` unconditionally used to erase the errors that matter most:
 * Prisma messages begin with a newline and Node's `AggregateError` (thrown when a
 * dual-stack connect fails) carries an empty message, so both logged as `""`. An empty
 * `error` field is worse than a noisy one — it says something went wrong and refuses to
 * say what. Fall back through the first non-blank line, then the error's own name and
 * code, so there is always something to act on.
 */
function firstMeaningfulLine(value: unknown): string {
  const source = value instanceof Error ? value.message : String(value);
  const line = source.split(/\r?\n/).find((candidate) => candidate.trim().length > 0);
  if (line) return line.trim();

  if (value instanceof Error) {
    const { code } = value as Error & { code?: unknown };
    const name = value.name || 'Error';
    return typeof code === 'string' && code.length > 0 ? `${name} (${code})` : name;
  }

  return '[no message]';
}

export function redactLogValue(value: unknown): string {
  const raw = firstMeaningfulLine(value);
  const redacted = REDACTION_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    raw,
  );

  return redacted.length > MAX_LOG_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_LOG_MESSAGE_LENGTH)}...`
    : redacted;
}
