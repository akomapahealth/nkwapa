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

export function redactLogValue(value: unknown): string {
  const raw = (value instanceof Error ? value.message : String(value)).split(/\r?\n/)[0];
  const redacted = REDACTION_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    raw,
  );

  return redacted.length > MAX_LOG_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_LOG_MESSAGE_LENGTH)}...`
    : redacted;
}
