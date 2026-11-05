import { getStoredActiveClinicId, setStoredActiveClinicId } from './bootstrap-storage';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const DEFAULT_TIMEOUT_MS = 12000;

// Tracks whether bootstrap (/auth/whoami) has validated the stored active
// clinic id at least once in this session. Until it has, apiFetch will not
// auto-attach a possibly-stale X-Clinic-Id header from localStorage.
let bootstrapResolved = false;

export function markBootstrapResolved(): void {
  bootstrapResolved = true;
}

export function isBootstrapResolved(): boolean {
  return bootstrapResolved;
}

export function resetBootstrapResolved(): void {
  bootstrapResolved = false;
}

/**
 * Clears any locally-stored active clinic id. Used for self-healing when the
 * server reports the stored id is no longer valid (e.g. clinic was deleted
 * or user no longer has access after a DB reseed).
 */
export function clearStaleActiveClinic(): void {
  setStoredActiveClinicId(null);
}

export type GetToken = () => Promise<string | null>;

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number | null;
  code: string | null;
  requestId: string | null;
  retryable: boolean;
  recoveryAction: string | null;
  fieldErrors: ApiFieldError[];

  constructor(
    message: string,
    options?: {
      status?: number | null;
      code?: string | null;
      requestId?: string | null;
      retryable?: boolean;
      recoveryAction?: string | null;
      fieldErrors?: ApiFieldError[];
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status ?? null;
    this.code = options?.code ?? null;
    this.requestId = options?.requestId ?? null;
    this.retryable = options?.retryable ?? false;
    this.recoveryAction = options?.recoveryAction ?? null;
    this.fieldErrors = options?.fieldErrors ?? [];
  }
}

export interface ApiFetchOptions extends RequestInit {
  getToken?: GetToken;
  activeClinicId?: string | null;
  timeoutMs?: number;
  requestId?: string;
  /** When true, do not send X-Clinic-Id header (e.g. for admin endpoints) */
  skipClinicHeader?: boolean;
  /**
   * The Idempotency-Key for this write. Left out, a write gets one derived from what it sends,
   * reused until the server gives a definitive answer (#307).
   */
  idempotencyKey?: string;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PENDING_KEY_TTL_MS = 30 * 60 * 1000;
// Per tab, so a retry after a reload keeps its key; only hashes are stored, never a request body.
const PENDING_KEYS_STORAGE = 'nkwapa:pending-idempotency-keys';
let pendingIdempotencyKeys: Map<string, { key: string; at: number }> | null = null;

function pendingKeys() {
  if (!pendingIdempotencyKeys) {
    pendingIdempotencyKeys = new Map();
    try {
      const stored = JSON.parse(globalThis.sessionStorage?.getItem(PENDING_KEYS_STORAGE) ?? '{}');
      for (const [id, entry] of Object.entries(stored as Record<string, unknown>)) {
        const { key, at } = (entry ?? {}) as { key?: unknown; at?: unknown };
        if (typeof key === 'string' && typeof at === 'number') {
          pendingIdempotencyKeys.set(id, { key, at });
        }
      }
    } catch {
      // Storage blocked or corrupt: keys then last only as long as this page.
    }
  }
  return pendingIdempotencyKeys;
}

function savePendingKeys() {
  try {
    globalThis.sessionStorage?.setItem(
      PENDING_KEYS_STORAGE,
      JSON.stringify(Object.fromEntries(pendingKeys())),
    );
  } catch {
    // As above: the in-memory copy still covers retries without a reload.
  }
}

/** A SHA-256 of the method, path and body, so storage never holds patient data. */
async function fingerprintId(fingerprint: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fingerprint;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * One key per action: the same method, path and body sent again after a timeout, network
 * failure or 5xx reuses the key, even after a reload, so the API replays the first result
 * instead of writing twice.
 */
function idempotencyKeyFor(id: string, now: number): string {
  const keys = pendingKeys();
  for (const [stored, entry] of keys) {
    if (now - entry.at > PENDING_KEY_TTL_MS) keys.delete(stored);
  }
  const existing = keys.get(id);
  if (existing) return existing.key;
  const key = createRequestId().replace(/[^A-Za-z0-9_-]/g, '');
  keys.set(id, { key, at: now });
  // Only a hashed id is persisted; the raw fallback (no WebCrypto) stays in memory.
  if (/^[0-9a-f]{64}$/.test(id)) savePendingKeys();
  return key;
}

function settlePendingKey(id: string) {
  if (pendingKeys().delete(id)) savePendingKeys();
}

/** A retry could still be the same action: the server never answered, failed, or is mid-write. */
function keepsIdempotencyKey(status: number) {
  return status >= 500 || status === 429 || status === 409 || status === 408;
}

/** Forget every pending key, in memory and in this tab's storage. */
export function resetPendingIdempotencyKeys(): void {
  pendingIdempotencyKeys = new Map();
  try {
    globalThis.sessionStorage?.removeItem(PENDING_KEYS_STORAGE);
  } catch {
    // Nothing stored to clear.
  }
}

/** Test hook: drop the in-memory copy, as a reload does, so keys come back from storage. */
export function forgetPendingIdempotencyKeysInMemory(): void {
  pendingIdempotencyKeys = null;
}

type ApiErrorPayload = {
  code?: string;
  message?: string | string[];
  requestId?: string;
  retryable?: boolean;
  recoveryAction?: string;
  fieldErrors?: ApiFieldError[];
};

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `req-${Date.now()}`;
}

function combineAbortSignals(source: AbortSignal | null, timeoutSignal: AbortSignal) {
  if (!source) {
    return timeoutSignal;
  }

  if (source.aborted) {
    return source;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  source.addEventListener('abort', abort, { once: true });
  timeoutSignal.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function getDefaultErrorMessage(status: number) {
  if (status >= 500) {
    return 'The server hit a problem while processing your request.';
  }

  if (status === 429) {
    return 'Too many requests were sent in a short time.';
  }

  return `Request failed with status ${status}.`;
}

export async function readApiError(response: Response): Promise<ApiError> {
  const raw = await response.text();
  const requestId =
    response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id');

  if (!raw) {
    return new ApiError(getDefaultErrorMessage(response.status), {
      status: response.status,
      requestId,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  try {
    const parsed = JSON.parse(raw) as ApiErrorPayload | string;
    if (typeof parsed === 'string') {
      return new ApiError(parsed, {
        status: response.status,
        requestId,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    const message = Array.isArray(parsed.message)
      ? parsed.message.join(', ')
      : (parsed.message ?? getDefaultErrorMessage(response.status));

    return new ApiError(message, {
      status: response.status,
      code: parsed.code ?? null,
      requestId: parsed.requestId ?? requestId,
      retryable:
        typeof parsed.retryable === 'boolean'
          ? parsed.retryable
          : response.status >= 500 || response.status === 429,
      recoveryAction: parsed.recoveryAction ?? null,
      fieldErrors: parsed.fieldErrors ?? [],
    });
  } catch {
    return new ApiError(raw, {
      status: response.status,
      requestId,
      retryable: response.status >= 500 || response.status === 429,
    });
  }
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) {
  if (error instanceof ApiError) {
    return error.recoveryAction ? `${error.message} ${error.recoveryAction}`.trim() : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const {
    getToken,
    activeClinicId: explicitClinicId,
    skipClinicHeader,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requestId,
    idempotencyKey,
    ...init
  } = options;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (getToken) {
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  if (!skipClinicHeader) {
    // Prefer the caller's explicit value. Only fall back to the stored
    // active clinic id once bootstrap has confirmed it is valid for this
    // session — otherwise a stale value from a prior session (e.g. after a
    // DB reseed) could attach to every request and produce spurious 404s.
    const clinicId =
      explicitClinicId !== undefined
        ? explicitClinicId
        : typeof window !== 'undefined' && bootstrapResolved
          ? getStoredActiveClinicId()
          : null;
    if (clinicId) {
      headers.set('X-Clinic-Id', clinicId);
    }
  }
  if (!headers.has('X-Request-Id')) {
    headers.set('X-Request-Id', requestId ?? createRequestId());
  }
  const method = (init.method ?? 'GET').toUpperCase();
  // Only a string body can be fingerprinted; FormData uploads keep their old behaviour.
  const fingerprintText =
    WRITE_METHODS.has(method) && !idempotencyKey && !headers.has('Idempotency-Key')
      ? init.body == null || typeof init.body === 'string'
        ? `${method} ${path} ${init.body ?? ''}`
        : null
      : null;
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }
  const fingerprint = fingerprintText ? await fingerprintId(fingerprintText) : null;
  if (!idempotencyKey && fingerprint) {
    headers.set('Idempotency-Key', idempotencyKeyFor(fingerprint, Date.now()));
  }

  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: combineAbortSignals(init.signal ?? null, timeoutController.signal),
    });
    if (fingerprint && !keepsIdempotencyKey(response.status)) {
      settlePendingKey(fingerprint);
    }
    return response;
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new ApiError('The request took too long to complete.', {
        code: 'REQUEST_TIMEOUT',
        retryable: true,
        recoveryAction: 'Check your connection and retry.',
      });
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("We couldn't reach the server.", {
      code: 'NETWORK_ERROR',
      retryable: true,
      recoveryAction: 'Check your connection and try again.',
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
