const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape every interpolated value.
 *
 * The templates this replaces did a raw `String.replace` of `{{key}}`, so a clinic name
 * containing a `<` injected markup straight into a patient's inbox. Values reaching
 * these templates are operator- and patient-supplied, so escaping is not optional.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export const DEFAULT_TIMEZONE = 'Africa/Accra';

function formatInTimeZone(
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(value);
  } catch {
    // An unknown IANA zone must not cost the patient their reminder.
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: DEFAULT_TIMEZONE }).format(
      value,
    );
  }
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Render an instant in the clinic's timezone, not the server's.
 *
 * `toLocaleString()` with no zone follows the host, so a UTC container told a patient in
 * Accra the wrong appointment time.
 */
export function formatDateTime(value: string | undefined, timeZone = DEFAULT_TIMEZONE): string {
  const parsed = parseDate(value);
  if (!parsed) return 'the scheduled time';
  return formatInTimeZone(parsed, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    // Zero-padded 24-hour: an appointment card that reads "8:30" leaves a patient to
    // guess morning or evening, and am/pm markers vary by mail client locale.
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function formatDate(value: string | undefined, timeZone = DEFAULT_TIMEZONE): string {
  const parsed = parseDate(value);
  if (!parsed) return 'the scheduled date';
  return formatInTimeZone(parsed, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Coerce an unknown payload field to a non-empty string, falling back to `fallback`. */
export function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function optionalStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Accept only an absolute http(s) URL.
 *
 * These become anchors in mail sent to patients, so a payload that somehow carried a
 * `javascript:` value must not be turned into a clickable link.
 */
export function optionalUrl(value: unknown): string | null {
  const candidate = optionalStr(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
