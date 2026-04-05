import { Transform } from 'class-transformer';

const MULTI_SPACE_RE = /\s+/g;

function stripControlCharacters(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
}

export function sanitizePlainText(
  value: unknown,
  options?: {
    maxLength?: number;
    preserveNewlines?: boolean;
    collapseWhitespace?: boolean;
  },
) {
  if (typeof value !== 'string') {
    return value;
  }

  const preserveNewlines = options?.preserveNewlines ?? false;
  const collapseWhitespace = options?.collapseWhitespace ?? true;
  const normalizedWhitespace = preserveNewlines
    ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    : value.replace(MULTI_SPACE_RE, ' ');

  let sanitized = stripControlCharacters(normalizedWhitespace);
  if (collapseWhitespace && preserveNewlines) {
    sanitized = sanitized
      .split('\n')
      .map((line) => line.replace(MULTI_SPACE_RE, ' ').trim())
      .join('\n')
      .trim();
  } else {
    sanitized = sanitized.trim();
  }

  if (options?.maxLength != null && sanitized.length > options.maxLength) {
    sanitized = sanitized.slice(0, options.maxLength);
  }

  return sanitized;
}

export function normalizeEmailInput(value: unknown) {
  const sanitized = sanitizePlainText(value, {
    maxLength: 320,
    collapseWhitespace: true,
  });
  if (typeof sanitized !== 'string') {
    return sanitized;
  }

  return sanitized.toLowerCase();
}

export function normalizeCursorInput(value: unknown) {
  return sanitizePlainText(value, {
    maxLength: 160,
    collapseWhitespace: false,
  });
}

export function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}

export function normalizeBooleanInput(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}

export function ToSanitizedString(options?: {
  maxLength?: number;
  preserveNewlines?: boolean;
  collapseWhitespace?: boolean;
}) {
  return Transform(({ value }) => sanitizePlainText(value, options));
}

export function ToNormalizedEmail() {
  return Transform(({ value }) => normalizeEmailInput(value));
}

export function ToCursor() {
  return Transform(({ value }) => normalizeCursorInput(value));
}

export function ToOptionalNumber() {
  return Transform(({ value }) => normalizeOptionalNumber(value));
}

export function ToOptionalBoolean() {
  return Transform(({ value }) => normalizeBooleanInput(value));
}
