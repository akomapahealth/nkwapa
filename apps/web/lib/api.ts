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

  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: combineAbortSignals(init.signal ?? null, timeoutController.signal),
    });
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
